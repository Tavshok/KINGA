#!/usr/bin/env python3
"""
Advanced PDF Processing Module for KINGA
Extracts text, tables, images, and handwritten notes from assessment PDFs
"""

import fitz  # PyMuPDF
import pdfplumber
import pytesseract
from PIL import Image
import io
import json
import sys
import re
from typing import Dict, List, Tuple, Optional
import base64


class AdvancedPDFProcessor:
    """
    Comprehensive PDF processing for insurance assessment documents
    """
    
    def __init__(self):
        self.extracted_data = {}
        
    def process_pdf(self, pdf_path: str) -> Dict:
        """
        Extract all data from PDF: text, tables, images, handwritten notes
        
        Returns:
            {
                "text_content": str,
                "tables": List[Dict],
                "images": List[Dict],
                "handwritten_notes": List[str],
                "metadata": Dict,
                "structured_data": Dict
            }
        """
        try:
            # Open PDF with both libraries
            doc_fitz = fitz.open(pdf_path)
            
            # Extract metadata
            metadata = self._extract_metadata(doc_fitz)
            
            # Extract text
            text_content = self._extract_text(doc_fitz)
            
            # Extract tables
            tables = self._extract_tables(pdf_path)
            
            # Extract images
            images = self._extract_images(doc_fitz)
            
            # Extract handwritten notes using OCR
            handwritten_notes = self._extract_handwritten_notes(doc_fitz)
            
            # Parse structured data from text
            structured_data = self._parse_structured_data(text_content, tables)
            
            doc_fitz.close()
            
            return {
                "text_content": text_content,
                "tables": tables,
                "images": images,
                "handwritten_notes": handwritten_notes,
                "metadata": metadata,
                "structured_data": structured_data,
                "success": True
            }
            
        except Exception as e:
            return {
                "error": str(e),
                "success": False
            }
    
    def _extract_metadata(self, doc: fitz.Document) -> Dict:
        """Extract PDF metadata"""
        metadata = doc.metadata
        return {
            "title": metadata.get("title", ""),
            "author": metadata.get("author", ""),
            "subject": metadata.get("subject", ""),
            "creator": metadata.get("creator", ""),
            "producer": metadata.get("producer", ""),
            "creation_date": metadata.get("creationDate", ""),
            "modification_date": metadata.get("modDate", ""),
            "page_count": doc.page_count,
        }
    
    def _extract_text(self, doc: fitz.Document) -> str:
        """Extract all text from PDF"""
        text_content = ""
        for page_num in range(doc.page_count):
            page = doc[page_num]
            text_content += f"\n--- Page {page_num + 1} ---\n"
            text_content += page.get_text()
        return text_content
    
    def _extract_tables(self, pdf_path: str) -> List[Dict]:
        """Extract tables from PDF using pdfplumber"""
        tables = []
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    page_tables = page.extract_tables()
                    for table_num, table in enumerate(page_tables):
                        if table:
                            tables.append({
                                "page": page_num + 1,
                                "table_number": table_num + 1,
                                "data": table,
                                "headers": table[0] if table else [],
                                "rows": table[1:] if len(table) > 1 else []
                            })
        except Exception as e:
            print(f"Warning: Table extraction failed - {str(e)}", file=sys.stderr)
        
        return tables
    
    def _extract_images(self, doc: fitz.Document) -> List[Dict]:
        """Extract all images from PDF"""
        images = []
        for page_num in range(doc.page_count):
            page = doc[page_num]
            image_list = page.get_images()
            
            for img_index, img in enumerate(image_list):
                xref = img[0]
                try:
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image["ext"]
                    
                    # Convert to base64 for transport
                    image_b64 = base64.b64encode(image_bytes).decode('utf-8')
                    
                    images.append({
                        "page": page_num + 1,
                        "image_number": img_index + 1,
                        "format": image_ext,
                        "size_bytes": len(image_bytes),
                        "data_base64": image_b64[:100] + "...",  # Truncate for JSON
                        "full_data": image_b64  # Full data for saving
                    })
                except Exception as e:
                    print(f"Warning: Failed to extract image {img_index} from page {page_num + 1} - {str(e)}", file=sys.stderr)
        
        return images
    
    def _extract_handwritten_notes(self, doc: fitz.Document) -> List[str]:
        """Extract handwritten notes using OCR"""
        handwritten_notes = []
        
        try:
            for page_num in range(doc.page_count):
                page = doc[page_num]
                
                # Render page as image for OCR
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better OCR
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                
                # Perform OCR
                ocr_text = pytesseract.image_to_string(img)
                
                # Compare OCR text with extracted text to find handwritten portions
                extracted_text = page.get_text()
                
                # Simple heuristic: OCR text not in extracted text is likely handwritten
                ocr_lines = ocr_text.strip().split('\n')
                for line in ocr_lines:
                    line = line.strip()
                    if line and len(line) > 5 and line not in extracted_text:
                        handwritten_notes.append(f"Page {page_num + 1}: {line}")
                        
        except Exception as e:
            print(f"Warning: OCR failed - {str(e)}", file=sys.stderr)
        
        return handwritten_notes
    
    def _parse_structured_data(self, text: str, tables: List[Dict]) -> Dict:
        """
        Parse structured data from text and tables
        Extracts vehicle details, damage info, costs, etc.
        """
        structured = {
            "vehicle": {},
            "claimant": {},
            "damage": {},
            "costs": {},
            "assessor": {}
        }
        
        # Extract vehicle information
        vehicle_patterns = {
            "make": r"(?:Make|Manufacturer):\s*([A-Za-z]+)",
            "model": r"(?:Model):\s*([A-Za-z0-9\s]+)",
            "year": r"(?:Year|Model Year):\s*(\d{4})",
            "registration": r"(?:Registration|Reg No|Plate):\s*([A-Z0-9\s-]+)",
            "vin": r"(?:VIN|Chassis):\s*([A-Z0-9]{17})",
            "color": r"(?:Colo[u]?r):\s*([A-Za-z]+)",
        }
        
        for key, pattern in vehicle_patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                structured["vehicle"][key] = match.group(1).strip()
        
        # Extract claimant information
        claimant_patterns = {
            "name": r"(?:Claimant|Insured|Owner):\s*([A-Za-z\s]+)",
            "policy_number": r"(?:Policy|Policy No):\s*([A-Z0-9-]+)",
            "claim_number": r"(?:Claim|Claim No):\s*([A-Z0-9-]+)",
        }
        
        for key, pattern in claimant_patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                structured["claimant"][key] = match.group(1).strip()
        
        # Extract damage information
        damage_keywords = ["damage", "impact", "collision", "dent", "scratch", "broken", "cracked"]
        damage_lines = []
        for line in text.split('\n'):
            if any(keyword in line.lower() for keyword in damage_keywords):
                damage_lines.append(line.strip())
        structured["damage"]["description"] = "\n".join(damage_lines[:10])  # Limit to 10 lines
        
        # Extract costs from tables
        if tables:
            for table in tables:
                for row in table.get("rows", []):
                    # Look for cost-related rows
                    row_text = " ".join(str(cell) for cell in row if cell)
                    if any(keyword in row_text.lower() for keyword in ["total", "cost", "amount", "price"]):
                        # Extract numbers
                        numbers = re.findall(r'\$?[\d,]+\.?\d*', row_text)
                        if numbers:
                            structured["costs"][row_text[:50]] = numbers[-1]  # Last number is usually the total
        
        # Extract assessor information
        assessor_patterns = {
            "name": r"(?:Assessor|Inspector|Surveyor):\s*([A-Za-z\s]+)",
            "date": r"(?:Date|Assessment Date):\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        }
        
        for key, pattern in assessor_patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                structured["assessor"][key] = match.group(1).strip()
        
        return structured
    
    def extract_damage_photos(self, pdf_path: str, output_dir: str = "/tmp") -> List[str]:
        """
        Extract damage photos from PDF and save to disk
        Returns list of saved file paths
        """
        saved_paths = []
        
        try:
            doc = fitz.open(pdf_path)
            
            for page_num in range(doc.page_count):
                page = doc[page_num]
                image_list = page.get_images()
                
                for img_index, img in enumerate(image_list):
                    xref = img[0]
                    try:
                        base_image = doc.extract_image(xref)
                        image_bytes = base_image["image"]
                        image_ext = base_image["ext"]
                        
                        # Save image
                        filename = f"{output_dir}/damage_photo_p{page_num+1}_i{img_index+1}.{image_ext}"
                        with open(filename, "wb") as f:
                            f.write(image_bytes)
                        
                        saved_paths.append(filename)
                    except Exception as e:
                        print(f"Warning: Failed to save image - {str(e)}", file=sys.stderr)
            
            doc.close()
            
        except Exception as e:
            print(f"Error: {str(e)}", file=sys.stderr)
        
        return saved_paths


def main():
    """
    CLI interface for PDF processing
    Usage: python3 pdf_processor.py <pdf_path>
    """
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python3 pdf_processor.py <pdf_path>"
        }))
        sys.exit(1)
    
    try:
        pdf_path = sys.argv[1]
        
        processor = AdvancedPDFProcessor()
        result = processor.process_pdf(pdf_path)
        
        # Remove full image data from JSON output (too large)
        if "images" in result:
            for img in result["images"]:
                if "full_data" in img:
                    del img["full_data"]
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "success": False
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
