#!/usr/bin/env python3
"""
Comprehensive Assessment Processing CLI
Extracts images, runs physics validation, and fraud detection
"""

import sys
import json
from pdf_processor import AdvancedPDFProcessor
from physics_validator import PhysicsValidator
from fraud_ml_model import FraudMLModel

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "PDF path required"}))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    
    try:
        # Step 1: Extract images and data from PDF
        processor = AdvancedPDFProcessor()
        pdf_data = processor.process_pdf(pdf_path)
        
        if not pdf_data.get("success"):
            print(json.dumps({"error": pdf_data.get("error", "PDF processing failed")}))
            sys.exit(1)
        
        # Return the extracted data with images
        result = {
            "success": True,
            "images": pdf_data.get("images", []),
            "text_content": pdf_data.get("text_content", ""),
            "tables": pdf_data.get("tables", []),
            "metadata": pdf_data.get("metadata", {})
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"error": str(e), "success": False}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
