// Product Scraper Server using Puppeteer
// This runs on a server and your iOS app calls it via HTTP

const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

// Endpoint your iOS app will call
app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let browser;
  try {
    // Launch headless browser
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
    
    // Navigate to the product page
    await page.goto(url, { 
      waitUntil: 'networkidle2', // Wait for page to fully load
      timeout: 30000 
    });

    // Wait a bit for JavaScript to render prices
    await page.waitForTimeout(2000);

    // Extract data using browser context (this sees the RENDERED page!)
    const productData = await page.evaluate(() => {
      // Helper function to find all prices on the page
      const findAllPrices = () => {
        const prices = [];
        const priceSelectors = [
          '.a-price .a-offscreen',           // Amazon sale price
          '[class*="price"]',                // Generic price classes
          '[data-price]',                    // Data attributes
          '[aria-label*="$"]',               // Aria labels with dollar signs
        ];

        priceSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const text = el.textContent || el.getAttribute('data-price') || el.getAttribute('aria-label');
            if (text) {
              const match = text.match(/\$?(\d+\.?\d*)/);
              if (match) {
                const price = parseFloat(match[1]);
                if (price > 0 && price < 100000) {
                  prices.push(price);
                }
              }
            }
          });
        });

        return prices;
      };

      // Get product name
      const name = document.querySelector('[id="productTitle"]')?.textContent.trim() ||
                   document.querySelector('h1')?.textContent.trim() ||
                   document.querySelector('meta[property="og:title"]')?.content ||
                   'Unknown Product';

      // Get all prices and use the minimum (likely the sale price)
      const allPrices = findAllPrices();
      const price = allPrices.length > 0 ? Math.min(...allPrices) : null;

      // Get image
      const imageURL = document.querySelector('[id="landingImage"]')?.src ||
                       document.querySelector('meta[property="og:image"]')?.content ||
                       null;

      return {
        name: name.substring(0, 200), // Limit length
        price: price,
        imageURL: imageURL
      };
    });

    await browser.close();

    // Return clean data to iOS app
    res.json({
      success: true,
      data: productData
    });

  } catch (error) {
    console.error('Scraping error:', error);
    if (browser) await browser.close();
    
    res.status(500).json({
      success: false,
      error: 'Failed to scrape product data'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Scraper server running on port ${PORT}`);
});
