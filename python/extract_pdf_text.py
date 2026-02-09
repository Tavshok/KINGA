#!/usr/bin/env python3
"""
Extract text from PDF for diagnostic purposes
"""
import sys
import json
import PyPDF2

def extract_text_from_pdf(pdf_path):
    """Extract all text from PDF"""
    try:
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ''
            
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                text += page.extract_text() + '\n'
            
            return {
                'success': True,
                'text': text,
                'page_count': len(pdf_reader.pages),
                'char_count': len(text)
            }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'text': ''
        }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No PDF path provided'}))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    result = extract_text_from_pdf(pdf_path)
    print(json.dumps(result))
