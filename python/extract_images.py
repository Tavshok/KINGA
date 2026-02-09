#!/usr/bin/env python3
"""
Extract images from PDF and write to a JSON file (not stdout).
This avoids buffer issues with large base64 data.
Usage: python3 extract_images.py <pdf_path> <output_json_path>
"""

import sys
import json
import base64

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: extract_images.py <pdf_path> <output_json_path>"}))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    output_path = sys.argv[2]
    
    try:
        import fitz  # PyMuPDF
    except ImportError:
        # Write error to output file
        with open(output_path, 'w') as f:
            json.dump({"error": "PyMuPDF not installed", "images": []}, f)
        sys.exit(0)
    
    try:
        doc = fitz.open(pdf_path)
        images = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            image_list = page.get_images(full=True)
            
            for img_idx, img_info in enumerate(image_list):
                xref = img_info[0]
                try:
                    base_image = doc.extract_image(xref)
                    if base_image:
                        image_data = base_image["image"]
                        image_ext = base_image.get("ext", "png")
                        size_bytes = len(image_data)
                        
                        # Only include images larger than 5KB (skip icons/logos)
                        if size_bytes > 5000:
                            images.append({
                                "page": page_num + 1,
                                "image_number": img_idx + 1,
                                "format": image_ext,
                                "size_bytes": size_bytes,
                                "full_data": base64.b64encode(image_data).decode('utf-8')
                            })
                except Exception as e:
                    # Skip individual image errors
                    pass
        
        doc.close()
        
        # Write to file instead of stdout
        result = {
            "success": True,
            "total_images": len(images),
            "images": images
        }
        
        with open(output_path, 'w') as f:
            json.dump(result, f)
        
        # Print summary to stdout (small output for Node.js to parse)
        print(json.dumps({"success": True, "total_images": len(images), "output_path": output_path}))
        
    except Exception as e:
        with open(output_path, 'w') as f:
            json.dump({"error": str(e), "images": []}, f)
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(0)  # Exit 0 so Node.js doesn't reject

if __name__ == "__main__":
    main()
