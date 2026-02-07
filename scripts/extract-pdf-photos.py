#!/usr/bin/env python3
"""
Extract vehicle damage photos from PDF assessment reports.
Only extracts pages that contain actual photos, filtering out text-only pages.
"""

import sys
import json
from pathlib import Path
from pdf2image import convert_from_path
from PIL import Image
import io

def has_significant_image_content(image: Image.Image, threshold=0.3) -> bool:
    """
    Determine if a page contains significant image content (not just text).
    
    Args:
        image: PIL Image object of the PDF page
        threshold: Minimum ratio of unique colors to consider it an image-heavy page
    
    Returns:
        True if page appears to contain photos/images, False if mostly text
    """
    # Convert to RGB if needed
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Resize to speed up analysis
    small = image.resize((100, 100), Image.Resampling.LANCZOS)
    
    # Count unique colors
    colors = small.getcolors(maxcolors=10000)
    if not colors:
        return True  # Too many colors = likely contains photos
    
    unique_colors = len(colors)
    total_pixels = 100 * 100
    
    # Calculate color diversity ratio
    color_ratio = unique_colors / total_pixels
    
    # Pages with photos have more color diversity than text-only pages
    return color_ratio > threshold

def extract_photos_from_pdf(pdf_path: str, output_dir: str, dpi=150) -> list[str]:
    """
    Extract photo pages from PDF and save as PNG files.
    
    Args:
        pdf_path: Path to input PDF file
        output_dir: Directory to save extracted images
        dpi: Resolution for PDF rendering (150 is good balance of quality/size)
    
    Returns:
        List of paths to extracted image files
    """
    try:
        # Convert PDF pages to images
        images = convert_from_path(pdf_path, dpi=dpi)
        
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        extracted_files = []
        photo_count = 0
        
        for i, image in enumerate(images, start=1):
            # Check if page contains photos
            if has_significant_image_content(image):
                photo_count += 1
                filename = f"damage-photo-{photo_count:03d}.png"
                filepath = output_path / filename
                
                # Save as PNG
                image.save(filepath, 'PNG', optimize=True)
                extracted_files.append(str(filepath))
        
        return extracted_files
    
    except Exception as e:
        print(f"Error extracting photos: {str(e)}", file=sys.stderr)
        raise

def main():
    if len(sys.argv) < 3:
        print("Usage: extract-pdf-photos.py <pdf_path> <output_dir>", file=sys.stderr)
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]
    
    try:
        extracted_files = extract_photos_from_pdf(pdf_path, output_dir)
        
        # Output JSON result
        result = {
            "success": True,
            "files": extracted_files,
            "count": len(extracted_files)
        }
        print(json.dumps(result))
    
    except Exception as e:
        result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(result))
        sys.exit(1)

if __name__ == "__main__":
    main()
