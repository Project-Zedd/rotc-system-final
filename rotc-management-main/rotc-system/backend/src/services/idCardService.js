const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../utils/logger');
const { getCadetById } = require('../models/cadet');

class IDCardService {
  constructor() {
    this.templatePath = path.join(__dirname, '../templates');
    this.outputPath = path.join(__dirname, '../../uploads/id-cards');
  }

  async generateIDCard(cadetId, options = {}) {
    try {
      const cadet = await getCadetById(cadetId);
      if (!cadet) {
        throw new Error('Cadet not found');
      }

      // Generate QR code
      const qrData = {
        studentNumber: cadet.student_number,
        name: `${cadet.first_name} ${cadet.last_name}`,
        validity: cadet.validity_date,
        semester: this.getCurrentSemester()
      };

      const qrCode = await QRCode.toDataURL(JSON.stringify(qrData), {
        width: 200,
        margin: 1,
        color: {
          dark: '#2F4F2F', // Military green
          light: '#FFFFFF'
        }
      });

      // Create ID card HTML
      const html = this.generateIDCardHTML(cadet, qrCode, options);

      // Generate PDF
      const pdfBuffer = await this.generatePDF(html);

      // Save file
      const filename = `id-card-${cadet.student_number}-${Date.now()}.pdf`;
      const filePath = path.join(this.outputPath, filename);
      
      await fs.mkdir(this.outputPath, { recursive: true });
      await fs.writeFile(filePath, pdfBuffer);

      return {
        filename,
        path: filePath,
        url: `/uploads/id-cards/${filename}`
      };

    } catch (error) {
      logger.error('Error generating ID card:', error);
      throw error;
    }
  }

  generateIDCardHTML(cadet, qrCode, options = {}) {
    const theme = options.theme || 'military-green';
    const colors = this.getThemeColors(theme);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>ROTC ID Card</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap');
          
          body {
            margin: 0;
            padding: 0;
            font-family: 'Roboto', sans-serif;
            background: ${colors.background};
            color: ${colors.text};
          }
          
          .id-card {
            width: 350px;
            height: 550px;
            background: ${colors.cardBackground};
            border: 3px solid ${colors.border};
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 8px 16px rgba(0,0,0,0.3);
            position: relative;
          }
          
          .header {
            background: ${colors.headerBackground};
            color: white;
            padding: 15px;
            text-align: center;
            border-bottom: 2px solid ${colors.border};
          }
          
          .university-name {
            font-size: 12px;
            font-weight: 900;
            margin: 0;
            letter-spacing: 0.5px;
          }
          
          .rotc-title {
            font-size: 14px;
            font-weight: 700;
            margin: 5px 0;
            color: ${colors.accent};
          }
          
          .id-title {
            font-size: 16px;
            font-weight: 900;
            margin: 10px 0;
            text-transform: uppercase;
          }
          
          .photo-section {
            text-align: center;
            padding: 20px;
          }
          
          .photo {
            width: 120px;
            height: 150px;
            border: 3px solid ${colors.border};
            border-radius: 10px;
            object-fit: cover;
          }
          
          .info-section {
            padding: 0 20px;
          }
          
          .info-row {
            margin: 8px 0;
            font-size: 12px;
          }
          
          .info-label {
            font-weight: 700;
            color: ${colors.label};
            display: inline-block;
            width: 100px;
          }
          
          .info-value {
            font-weight: 400;
            color: ${colors.text};
          }
          
          .qr-section {
            text-align: center;
            padding: 15px;
          }
          
          .qr-code {
            width: 100px;
            height: 100px;
            margin: 0 auto;
          }
          
          .validity {
            text-align: center;
            font-size: 11px;
            font-weight: 700;
            color: ${colors.accent};
            margin: 10px 0;
          }
          
          .footer {
            background: ${colors.headerBackground};
            color: white;
            text-align: center;
            padding: 10px;
            font-size: 14px;
            font-weight: 900;
            position: absolute;
            bottom: 0;
            width: 100%;
            box-sizing: border-box;
          }
          
          .watermark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 60px;
            font-weight: 900;
            color: ${colors.watermark};
            opacity: 0.1;
            z-index: 0;
          }
        </style>
      </head>
      <body>
        <div class="id-card">
          <div class="watermark">ROTC</div>
          
          <div class="header">
            <h1 class="university-name">LAGUNA STATE POLYTECHNIC UNIVERSITY</h1>
            <h2 class="rotc-title">ROTC UNIT</h2>
            <h3 class="id-title">CADET IDENTIFICATION CARD</h3>
          </div>
          
          <div class="photo-section">
            <img src="${cadet.photo || '/assets/default-photo.jpg'}" 
                 alt="Cadet Photo" 
                 class="photo"
                 onerror="this.src='/assets/default-photo.jpg'">
          </div>
          
          <div class="info-section">
            <div class="info-row">
              <span class="info-label">NAME:</span>
              <span class="info-value">${cadet.first_name} ${cadet.mi || ''} ${cadet.last_name}</span>
            </div>
            <div class="info-row">
              <span class="info-label">CADET NO:</span>
              <span class="info-value">${cadet.student_number}</span>
            </div>
            <div class="info-row">
              <span class="info-label">COURSE:</span>
              <span class="info-value">${cadet.course}</span>
            </div>
            <div class="info-row">
              <span class="info-label">SECTION:</span>
              <span class="info-value">${this.extractSection(cadet.student_number)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">CONTACT:</span>
              <span class="info-value">${cadet.contact_number}</span>
            </div>
          </div>
          
          <div class="qr-section">
            <img src="${qrCode}" alt="QR Code" class="qr-code">
          </div>
          
          <div class="validity">
            VALID UNTIL: ${cadet.validity_date || this.getDefaultValidity()}
          </div>
          
          <div class="footer">
            CADET
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async generatePDF(html) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0px',
          right: '0px',
          bottom: '0px',
          left: '0px'
        }
      });

      return pdf;
    } finally {
      await browser.close();
    }
  }

  getThemeColors(theme) {
    const themes = {
      'military-green': {
        background: '#2F4F2F',
        cardBackground: '#F5F5DC',
        text: '#2F4F2F',
        border: '#8B4513',
        headerBackground: '#2F4F2F',
        accent: '#8B4513',
        label: '#2F4F2F',
        watermark: '#2F4F2F'
      },
      'camouflage': {
        background: '#4A4A2A',
        cardBackground: '#F0E68C',
        text: '#2F2F2F',
        border: '#556B2F',
        headerBackground: '#556B2F',
        accent: '#8B4513',
        label: '#2F2F2F',
        watermark: '#556B2F'
      },
      'black-rust-orange': {
        background: '#1C1C1C',
        cardBackground: '#FFFFFF',
        text: '#1C1C1C',
        border: '#FF4500',
        headerBackground: '#1C1C1C',
        accent: '#FF4500',
        label: '#1C1C1C',
        watermark: '#1C1C1C'
      }
    };

    return themes[theme] || themes['military-green'];
  }

  extractSection(studentNumber) {
    // Extract section from student number format MS-32-MALE-1234
    const parts = studentNumber.split('-');
    return parts[1] || 'N/A';
  }

  getCurrentSemester() {
    const now = new Date();
    return now.getMonth() < 6 ? 1 : 2;
  }

  getDefaultValidity() {
    const now = new Date();
    const year = now.getFullYear() + 1;
    return `DEC ${year}`;
  }

  async generateBatchIDCards(cadetIds, options = {}) {
    const results = [];
    
    for (const cadetId of cadetIds) {
      try {
        const result = await this.generateIDCard(cadetId, options);
        results.push({ cadetId, success: true, ...result });
      } catch (error) {
        results.push({ cadetId, success: false, error: error.message });
      }
    }

    return results;
  }

  async previewIDCard(cadetId, options = {}) {
    try {
      const cadet = await getCadetById(cadetId);
      if (!cadet) {
        throw new Error('Cadet not found');
      }

      const qrData = {
        studentNumber: cadet.student_number,
        name: `${cadet.first_name} ${cadet.last_name}`,
        validity: cadet.validity_date,
        semester: this.getCurrentSemester()
      };

      const qrCode = await QRCode.toDataURL(JSON.stringify(qrData), {
        width: 200,
        margin: 1,
        color: {
          dark: '#2F4F2F',
          light: '#FFFFFF'
        }
      });

      return {
        html: this.generateIDCardHTML(cadet, qrCode, options),
        cadet,
        qrCode
      };
    } catch (error) {
      logger.error('Error previewing ID card:', error);
      throw error;
    }
  }
}

module.exports = new IDCardService();
