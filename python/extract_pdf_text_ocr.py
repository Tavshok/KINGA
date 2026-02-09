#!/usr/bin/env python3
"""
Extract text from PDF using both native text extraction and OCR for image-based pages
Handles text-based, image-based, and mixed PDFs
"""
import sys
import json
import PyPDF2
import pytesseract
from pdf2image import convert_from_path
from PIL import Image
import os

def extract_text_with_ocr(pdf_path):
    """
    Extract text from PDF using hybrid approach:
    1. Try native text extraction first (fast)
    2. If no text found, use OCR (slower but works on scanned PDFs)
    """
    try:
        # Step 1: Try native text extraction
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            native_text = ''
            page_count = len(pdf_reader.pages)
            
            for page_num in range(page_count):
                page = pdf_reader.pages[page_num]
                native_text += page.extract_text() + '\n'
        
        # Check if we got meaningful text (more than 100 chars)
        if len(native_text.strip()) > 100:
            return {
                'success': True,
                'text': native_text,
                'method': 'native',
                'page_count': page_count,
                'char_count': len(native_text)
            }
        
        # Step 2: Native extraction failed, try OCR
        print("Native text extraction yielded minimal text, attempting OCR...", file=sys.stderr)
        
        # Convert PDF pages to images
        images = convert_from_path(pdf_path, dpi=300)
        ocr_text = ''
        
        for i, image in enumerate(images):
            print(f"OCR processing page {i+1}/{len(images)}...", file=sys.stderr)
            # Extract text from image using Tesseract
            page_text = pytesseract.image_to_string(image, lang='eng')
            ocr_text += page_text + '\n'
        
        return {
            'success': True,
            'text': ocr_text,
            'method': 'ocr',
            'page_count': len(images),
            'char_count': len(ocr_text)
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'text': '',
            'method': 'failed'
        }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No PDF path provided'}))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    result = extract_text_with_ocr(pdf_path)
    print(json.dumps(result))
