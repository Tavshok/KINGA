#!/usr/bin/env python3
"""
Extract and classify images from PDF.
Classifies each image as 'damage_photo' or 'document' based on:
- Page text content density (text-heavy pages = document images)
- Image size in bytes (large images >100KB likely photos)
- Image dimensions and aspect ratio (photos tend to be 4:3 or 16:9)
- Image resolution (photos tend to be higher resolution)
- Position on page (full-page images = photos)
- Page image count (pages with single large image = photo pages)

Writes full results to a JSON file (not stdout) to avoid buffer issues.
Usage: python3 extract_images.py <pdf_path> <output_json_path>
"""

import sys
import json
import base64


def classify_image(page_text, img_width, img_height, size_bytes, page_image_count, page_width=0, page_height=0):
    """
    Classify an image as damage_photo or document based on multiple heuristics.
    
    Scoring system: positive = damage_photo, negative = document
    Final classification based on total score.
    """
    score = 0
    reasons = []
    
    text_len = len(page_text.strip())
    has_heavy_text = text_len > 200
    has_some_text = text_len > 50
    has_minimal_text = text_len <= 50
    
    # === Size-based signals ===
    if size_bytes > 200000:  # >200KB - almost certainly a photo
        score += 3
        reasons.append("large_file_200kb+")
    elif size_bytes > 100000:  # >100KB - likely a photo
        score += 2
        reasons.append("medium_file_100kb+")
    elif size_bytes > 50000:  # >50KB - could be either
        score += 1
        reasons.append("moderate_file_50kb+")
    elif size_bytes < 20000:  # <20KB - likely logo/icon/stamp
        score -= 2
        reasons.append("small_file_under_20kb")
    elif size_bytes < 10000:  # <10KB - definitely icon/logo
        score -= 3
        reasons.append("tiny_file_under_10kb")
    
    # === Resolution-based signals ===
    pixels = img_width * img_height
    if pixels > 500000:  # >500K pixels - photo resolution
        score += 2
        reasons.append("high_resolution")
    elif pixels > 200000:  # >200K pixels
        score += 1
        reasons.append("medium_resolution")
    elif pixels < 50000:  # <50K pixels - icon/logo
        score -= 2
        reasons.append("low_resolution")
    
    # === Aspect ratio signals ===
    if img_width > 0 and img_height > 0:
        aspect = max(img_width, img_height) / min(img_width, img_height)
        # Photos tend to be 4:3 (1.33) or 16:9 (1.78) or 3:2 (1.5)
        if 1.1 <= aspect <= 2.0:
            score += 1
            reasons.append("photo_aspect_ratio")
        # Very wide/tall = likely banner, header, or document element
        elif aspect > 4.0:
            score -= 2
            reasons.append("extreme_aspect_ratio")
        # Square-ish could be logo
        elif aspect < 1.1 and size_bytes < 50000:
            score -= 1
            reasons.append("square_small")
    
    # === Page text density signals ===
    if has_minimal_text:
        # Pages with no text are photo pages
        score += 2
        reasons.append("no_text_page")
    elif has_heavy_text:
        # Heavy text pages - images are usually logos/diagrams
        score -= 2
        reasons.append("heavy_text_page")
    elif has_some_text:
        # Some text - could be a caption page with photos
        if size_bytes > 100000:
            score += 1
            reasons.append("large_on_text_page")
        else:
            score -= 1
            reasons.append("small_on_text_page")
    
    # === Page image count signals ===
    if page_image_count == 1 and size_bytes > 100000:
        # Single large image on a page = likely the main photo
        score += 2
        reasons.append("single_large_image")
    elif page_image_count > 5:
        # Many images on one page = likely a document with icons/logos
        score -= 1
        reasons.append("many_images_on_page")
    
    # === Page coverage signals ===
    if page_width > 0 and page_height > 0:
        coverage = (img_width * img_height) / (page_width * page_height)
        if coverage > 0.3:
            score += 1
            reasons.append("large_page_coverage")
    
    classification = 'damage_photo' if score >= 1 else 'document'
    
    return classification, score, reasons


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: extract_images.py <pdf_path> <output_json_path>"}))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    output_path = sys.argv[2]
    
    try:
        import fitz  # PyMuPDF
    except ImportError:
        with open(output_path, 'w') as f:
            json.dump({"error": "PyMuPDF not installed", "images": [], "success": False}, f)
        print(json.dumps({"success": False, "error": "PyMuPDF not installed"}))
        sys.exit(0)
    
    try:
        doc = fitz.open(pdf_path)
        images = []
        damage_count = 0
        document_count = 0
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = page.get_text("text")
            image_list = page.get_images(full=True)
            page_image_count = len(image_list)
            page_rect = page.rect
            
            for img_idx, img_info in enumerate(image_list):
                xref = img_info[0]
                try:
                    base_image = doc.extract_image(xref)
                    if base_image:
                        image_data = base_image["image"]
                        image_ext = base_image.get("ext", "png")
                        img_width = base_image.get("width", 0)
                        img_height = base_image.get("height", 0)
                        size_bytes = len(image_data)
                        
                        # Skip tiny images (< 3KB) - icons, bullets, etc.
                        if size_bytes < 3000:
                            continue
                        
                        classification, conf_score, reasons = classify_image(
                            page_text, img_width, img_height, 
                            size_bytes, page_image_count,
                            page_rect.width, page_rect.height
                        )
                        
                        if classification == 'damage_photo':
                            damage_count += 1
                        else:
                            document_count += 1
                        
                        images.append({
                            "page": page_num + 1,
                            "image_number": img_idx + 1,
                            "format": image_ext,
                            "size_bytes": size_bytes,
                            "width": img_width,
                            "height": img_height,
                            "classification": classification,
                            "confidence_score": conf_score,
                            "classification_reasons": reasons,
                            "has_text_on_page": len(page_text.strip()) > 50,
                            "full_data": base64.b64encode(image_data).decode('utf-8')
                        })
                except Exception:
                    pass
        
        doc.close()
        
        result = {
            "success": True,
            "total_images": len(images),
            "damage_photos": damage_count,
            "document_images": document_count,
            "images": images
        }
        
        with open(output_path, 'w') as f:
            json.dump(result, f)
        
        # Print summary to stdout for Node.js
        print(json.dumps({
            "success": True, 
            "total_images": len(images),
            "damage_photos": damage_count,
            "document_images": document_count,
            "output_path": output_path
        }))
        
    except Exception as e:
        with open(output_path, 'w') as f:
            json.dump({"error": str(e), "images": [], "success": False}, f)
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(0)


if __name__ == "__main__":
    main()
