#!/usr/bin/env python3
"""
Image Forensics Module for KINGA
Detects photo manipulation, duplicate images, and analyzes EXIF data
"""

import cv2
import numpy as np
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
import imagehash
from typing import Dict, List, Tuple, Optional
import json
import sys
import os
import tempfile
from datetime import datetime


class ImageForensics:
    """
    Analyzes images for fraud indicators
    """
    
    def __init__(self):
        self.known_hashes: dict = {}  # Store hashes of previously seen images
        
    def analyze_image(self, image_path: str) -> Dict:
        """
        Comprehensive image analysis for fraud detection
        
        Returns:
            {
                "is_suspicious": bool,
                "confidence": float,
                "flags": List[str],
                "exif_data": Dict,
                "manipulation_indicators": Dict,
                "recommendations": List[str]
            }
        """
        flags = []
        manipulation_indicators = {}
        
        try:
            # Load image
            img_pil = Image.open(image_path)
            img_cv = cv2.imread(image_path)
            
            # 1. Extract and validate EXIF data (including GPS)
            exif_data = self._extract_exif(img_pil)
            gps_coords = self._extract_gps(img_pil)
            capture_dt = exif_data.get("DateTimeOriginal") or exif_data.get("DateTime")
            exif_flags = self._validate_exif(exif_data, gps_coords)
            flags.extend(exif_flags)
            
            # 2. Detect image manipulation
            manipulation_score, manip_flags = self._detect_manipulation(img_cv)
            manipulation_indicators["manipulation_score"] = manipulation_score
            flags.extend(manip_flags)
            
            # 3. Check for duplicate/similar images
            img_hash = self._calculate_hash(img_pil)
            duplicate_flags = self._check_duplicates(img_hash, image_path)
            flags.extend(duplicate_flags)
            
            # 4. Analyze image quality
            quality_flags = self._analyze_quality(img_cv)
            flags.extend(quality_flags)
            
            # 5. Detect common fraud patterns
            fraud_flags = self._detect_fraud_patterns(img_cv, exif_data)
            flags.extend(fraud_flags)
            
            # Calculate confidence
            confidence = 1.0 - (len(flags) * 0.15)
            confidence = max(0.0, min(1.0, confidence))
            
            is_suspicious = len(flags) > 0
            
            # Generate recommendations
            recommendations = []
            if is_suspicious:
                recommendations.append("Request original unedited photo from claimant")
                recommendations.append("Request additional photos from different angles")
                if manipulation_score > 0.5:
                    recommendations.append("Conduct in-person vehicle inspection")
                if any("EXIF" in flag for flag in flags):
                    recommendations.append("Request photo metadata verification")
            
            return {
                "is_suspicious": is_suspicious,
                "confidence": confidence,
                "flags": flags,
                "exif_data": exif_data,
                "gps_coordinates": gps_coords,
                "capture_datetime": capture_dt,
                "manipulation_indicators": manipulation_indicators,
                "image_hash": str(img_hash),
                "recommendations": recommendations,
            }
            
        except Exception as e:
            return {
                "error": str(e),
                "is_suspicious": True,
                "confidence": 0.0,
                "flags": [f"ERROR: Failed to analyze image - {str(e)}"],
                "gps_coordinates": None,
                "capture_datetime": None,
            }
    
    def _extract_exif(self, img: Image.Image) -> Dict:
        """Extract EXIF metadata from image (string-safe, skips GPSInfo raw bytes)."""
        exif_data = {}
        try:
            exif_raw = img._getexif()
            if exif_raw:
                for tag_id, value in exif_raw.items():
                    tag = TAGS.get(tag_id, tag_id)
                    if tag == "GPSInfo":
                        continue  # handled separately by _extract_gps
                    exif_data[str(tag)] = str(value)
        except Exception:
            pass
        return exif_data

    def _extract_gps(self, img: Image.Image) -> Optional[Dict]:
        """
        Extract GPS coordinates from EXIF GPSInfo tag.
        Returns {"latitude": float, "longitude": float} or None.
        """
        try:
            exif_raw = img._getexif()
            if not exif_raw:
                return None
            gps_raw = exif_raw.get(34853)  # 34853 == GPSInfo
            if not gps_raw:
                return None
            gps_info = {}
            for key, val in gps_raw.items():
                gps_info[GPSTAGS.get(key, key)] = val

            def _dms_to_decimal(dms, ref: str) -> float:
                d, m, s = float(dms[0]), float(dms[1]), float(dms[2])
                decimal = d + m / 60.0 + s / 3600.0
                if ref in ("S", "W"):
                    decimal = -decimal
                return decimal

            lat = gps_info.get("GPSLatitude")
            lat_ref = gps_info.get("GPSLatitudeRef", "N")
            lon = gps_info.get("GPSLongitude")
            lon_ref = gps_info.get("GPSLongitudeRef", "E")

            if lat and lon:
                return {
                    "latitude":  round(_dms_to_decimal(lat, lat_ref), 6),
                    "longitude": round(_dms_to_decimal(lon, lon_ref), 6),
                }
        except Exception:
            pass
        return None

    def _validate_exif(self, exif_data: Dict, gps_coords: Optional[Dict] = None) -> List[str]:
        """Validate EXIF data for fraud indicators."""
        flags = []

        if not exif_data:
            flags.append("SUSPICIOUS: No EXIF data found - image may have been edited or screenshots")

        software_tags = ["Software", "ProcessingSoftware", "HostComputer"]
        editing_software = ["Photoshop", "GIMP", "Paint", "Pixlr", "Snapseed", "Lightroom", "Affinity"]
        for tag in software_tags:
            if tag in exif_data:
                value = exif_data[tag].lower()
                if any(editor.lower() in value for editor in editing_software):
                    flags.append(f"MANIPULATION: Image edited with {exif_data[tag]}")

        if "DateTime" in exif_data and "DateTimeOriginal" in exif_data:
            if exif_data["DateTime"] != exif_data["DateTimeOriginal"]:
                flags.append("SUSPICIOUS: Image modification date differs from capture date")

        if gps_coords is None:
            flags.append("WARNING: No GPS data - cannot verify photo location")

        return flags
    
    def _detect_manipulation(self, img: np.ndarray) -> Tuple[float, List[str]]:
        """
        Detect image manipulation using Error Level Analysis (ELA) and other techniques
        Returns (manipulation_score, flags)
        """
        flags = []
        manipulation_score = 0.0
        
        try:
            # 1. Error Level Analysis (ELA)
            # Detects areas with different compression levels (indicating editing)
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Calculate image entropy (randomness)
            hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
            hist = hist / hist.sum()
            entropy = -np.sum(hist * np.log2(hist + 1e-7))
            
            # Low entropy suggests manipulation
            if entropy < 6.0:
                manipulation_score += 0.3
                flags.append(f"MANIPULATION INDICATOR: Low image entropy ({entropy:.2f}) suggests editing")
            
            # 2. Detect cloning (copy-paste within image)
            # Use feature matching to find duplicated regions
            sift = cv2.SIFT_create()
            kp, des = sift.detectAndCompute(gray, None)
            
            if des is not None and len(des) > 10:
                # Match features with themselves
                bf = cv2.BFMatcher()
                matches = bf.knnMatch(des, des, k=3)
                
                # Count strong self-matches (excluding identity matches)
                strong_matches = 0
                for m_list in matches:
                    if len(m_list) >= 2:
                        m, n = m_list[0], m_list[1]
                        if m.distance < 0.7 * n.distance and m.queryIdx != m.trainIdx:
                            strong_matches += 1
                
                clone_ratio = strong_matches / len(matches) if matches else 0
                if clone_ratio > 0.15:
                    manipulation_score += 0.4
                    flags.append(f"CLONING DETECTED: {clone_ratio*100:.1f}% of image features are duplicated")
            
            # 3. Check for unnatural edges (splicing detection)
            edges = cv2.Canny(gray, 50, 150)
            edge_density = np.sum(edges > 0) / edges.size
            
            if edge_density > 0.15:
                manipulation_score += 0.2
                flags.append(f"SUSPICIOUS EDGES: High edge density ({edge_density*100:.1f}%) may indicate splicing")
            
            # 4. Detect noise inconsistency
            # Natural photos have consistent noise; edited photos have varying noise
            noise = cv2.Laplacian(gray, cv2.CV_64F).var()
            if noise < 50:
                manipulation_score += 0.1
                flags.append(f"LOW NOISE: Unusually smooth image ({noise:.1f}) suggests heavy editing")
            
        except Exception as e:
            flags.append(f"WARNING: Manipulation detection failed - {str(e)}")
        
        return (manipulation_score, flags)
    
    def _calculate_hash(self, img: Image.Image) -> imagehash.ImageHash:
        """Calculate perceptual hash for duplicate detection"""
        return imagehash.phash(img)
    
    def _check_duplicates(self, img_hash: imagehash.ImageHash, image_path: str) -> List[str]:
        """Check if image is duplicate or very similar to previous claims"""
        flags = []
        
        # Check against known hashes
        for known_path, known_hash in self.known_hashes.items():
            similarity = 1 - (img_hash - known_hash) / 64.0  # Hamming distance
            
            if similarity > 0.95:
                flags.append(f"DUPLICATE IMAGE: Exact match with previous claim ({known_path})")
            elif similarity > 0.85:
                flags.append(f"SIMILAR IMAGE: {similarity*100:.1f}% similar to previous claim ({known_path})")
        
        # Store this hash
        self.known_hashes[image_path] = img_hash
        
        return flags
    
    def _analyze_quality(self, img: np.ndarray) -> List[str]:
        """Analyze image quality for fraud indicators"""
        flags = []
        
        # Check resolution
        height, width = img.shape[:2]
        megapixels = (height * width) / 1_000_000
        
        if megapixels < 1.0:
            flags.append(f"LOW RESOLUTION: {megapixels:.1f}MP - may be screenshot or heavily compressed")
        
        # Check for excessive compression
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        if blur < 100:
            flags.append(f"EXCESSIVE BLUR: Image quality poor ({blur:.1f}) - may hide details")
        
        return flags
    
    def _detect_fraud_patterns(self, img: np.ndarray, exif_data: Dict) -> List[str]:
        """Detect common fraud patterns"""
        flags = []
        
        # Check for watermarks (stock photos)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Detect text in image (watermarks often contain text)
        # Simple check: look for horizontal lines (text-like patterns)
        edges = cv2.Canny(gray, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, 100, minLineLength=100, maxLineGap=10)
        
        if lines is not None and len(lines) > 50:
            flags.append("WATERMARK SUSPECTED: Image contains many horizontal lines (possible stock photo)")
        
        # Check for perfect lighting (studio photos)
        mean_brightness = np.mean(gray)
        std_brightness = np.std(gray)
        
        if mean_brightness > 200 and std_brightness < 30:
            flags.append("STUDIO LIGHTING: Perfect lighting suggests non-accident photo")
        
        return flags
    
    def compare_images(self, img1_path: str, img2_path: str) -> Dict:
        """
        Compare two images for similarity (useful for detecting reused photos)
        """
        try:
            img1 = Image.open(img1_path)
            img2 = Image.open(img2_path)
            
            hash1 = imagehash.phash(img1)
            hash2 = imagehash.phash(img2)
            
            similarity = 1 - (hash1 - hash2) / 64.0
            
            return {
                "similarity": similarity,
                "is_duplicate": similarity > 0.95,
                "is_similar": similarity > 0.85,
            }
        except Exception as e:
            return {"error": str(e)}


def _download_url(url: str) -> str:
    """Download a remote image to a temp file and return the local path."""
    import urllib.request
    suffix = os.path.splitext(url.split("?")[0])[-1] or ".jpg"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    urllib.request.urlretrieve(url, tmp_path)
    return tmp_path


def main():
    """
    CLI interface for image forensics.
    Usage: python3 image_forensics.py <image_path_or_url>
    """
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python3 image_forensics.py <image_path_or_url>"}))
        sys.exit(1)

    arg = sys.argv[1]
    tmp_file = None

    try:
        if arg.startswith("http://") or arg.startswith("https://"):
            tmp_file = _download_url(arg)
            image_path = tmp_file
        else:
            image_path = arg

        forensics = ImageForensics()
        result = forensics.analyze_image(image_path)
        print(json.dumps(result, indent=2))

    except Exception as e:
        print(json.dumps({"error": str(e), "is_suspicious": True, "confidence": 0.0, "flags": [f"ERROR: {str(e)}"]})) 
        sys.exit(1)

    finally:
        if tmp_file and os.path.exists(tmp_file):
            os.unlink(tmp_file)


if __name__ == "__main__":
    main()
