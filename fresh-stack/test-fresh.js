/**
 * Test script for fresh-stack integration
 * Tests WCAG/SEO prompts, 512px validation, and license auth
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:4000';
const API_KEY = process.env.ALT_API_TOKEN || process.env.API_TOKEN;

// Simple 600x400 red rectangle as base64 (JPEG, ~1KB)
const TEST_IMAGE_600x400 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAGQAlgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9/KKKKAP/2Q==';

async function testAltTextAPI() {
  console.log('\n🧪 Testing fresh-stack /api/alt-text endpoint\n');

  // Test 1: Basic request with free tier (no auth)
  console.log('Test 1: Free tier request (600x400 image - should warn about 512px)');
  try {
    const response = await axios.post(`${BASE_URL}/api/alt-text`, {
      image: {
        base64: TEST_IMAGE_600x400.split('base64,')[1],
        width: 600,
        height: 400,
        mime_type: 'image/jpeg',
        filename: 'test-red-rectangle.jpg'
      },
      context: {
        title: 'Test Image',
        pageTitle: 'Test Page'
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Site-Key': 'test-free-tier'
      }
    });

    console.log('✅ Response:', {
      altText: response.data.altText,
      warnings: response.data.warnings,
      usage: response.data.usage,
      model: response.data.meta?.modelUsed
    });

    // Check for 512px warning
    const has512Warning = response.data.warnings?.some(w =>
      w.includes('512px') && w.includes('token savings')
    );
    console.log(has512Warning ? '✅ 512px warning present' : '❌ Missing 512px warning');

    // Check alt text format (should be 10-15 words, <125 chars)
    const altText = response.data.altText || '';
    const wordCount = altText.split(/\s+/).length;
    const charCount = altText.length;
    console.log(`   Alt text: "${altText}"`);
    console.log(`   Length: ${wordCount} words, ${charCount} chars`);
    console.log(wordCount >= 10 && wordCount <= 15 ? '✅ Word count optimal (10-15)' : `⚠️  Word count: ${wordCount}`);
    console.log(charCount <= 125 ? '✅ Character count optimal (≤125)' : `⚠️  Character count: ${charCount}`);

  } catch (error) {
    console.error('❌ Test 1 failed:', error.response?.data || error.message);
  }

  // Test 2: Quota check (should work without Supabase)
  console.log('\n\nTest 2: Quota check without Supabase');
  try {
    const response = await axios.post(`${BASE_URL}/api/alt-text`, {
      image: {
        base64: TEST_IMAGE_600x400.split('base64,')[1],
        width: 600,
        height: 400,
        mime_type: 'image/jpeg'
      }
    }, {
      headers: {
        'X-Site-Key': 'test-quota-check'
      }
    });

    console.log('✅ Quota check passed (graceful degradation working)');
  } catch (error) {
    if (error.response?.status === 402) {
      console.log('✅ Quota exceeded response:', error.response.data);
    } else {
      console.error('❌ Test 2 failed:', error.response?.data || error.message);
    }
  }

  // Test 3: Gray zone detection (simulate small base64 for large dimensions)
  console.log('\n\nTest 3: Gray zone detection (should reject suspiciously small base64)');
  try {
    const tinyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; // 1x1 pixel
    const response = await axios.post(`${BASE_URL}/api/alt-text`, {
      image: {
        base64: tinyBase64,
        width: 600, // Claim it's 600x400 but base64 is only 1x1
        height: 400,
        mime_type: 'image/png'
      }
    }, {
      headers: {
        'X-Site-Key': 'test-gray-zone'
      }
    });

    console.log('⚠️  Gray zone detection may have missed this (small pixel count)');
  } catch (error) {
    if (error.response?.status === 400) {
      const hasGrayZoneError = error.response.data.errors?.some(e =>
        e.includes('suspiciously small') || e.includes('gray zone')
      );
      console.log(hasGrayZoneError ? '✅ Gray zone detection working' : '⚠️  Different validation error:', error.response.data.errors);
    } else {
      console.error('❌ Test 3 failed:', error.response?.data || error.message);
    }
  }

  // Test 4: License key auth (if Supabase available)
  console.log('\n\nTest 4: License key authentication');
  try {
    const response = await axios.post(`${BASE_URL}/api/alt-text`, {
      image: {
        base64: TEST_IMAGE_600x400.split('base64,')[1],
        width: 512, // Optimal size
        height: 341,
        mime_type: 'image/jpeg'
      }
    }, {
      headers: {
        'X-License-Key': 'test-invalid-license',
        'X-Site-Key': 'test-license-auth'
      }
    });

    console.log('⚠️  License validation may be skipped (Supabase not configured)');
  } catch (error) {
    if (error.response?.status === 401 && error.response.data.code === 'INVALID_LICENSE_KEY') {
      console.log('✅ License key validation working');
    } else if (error.response?.status === 200) {
      console.log('⚠️  License validation skipped (Supabase not configured)');
    } else {
      console.error('❌ Test 4 failed:', error.response?.data || error.message);
    }
  }

  console.log('\n\n✨ Fresh-stack tests complete!\n');
}

// Run tests
if (require.main === module) {
  testAltTextAPI().catch(console.error);
}

module.exports = { testAltTextAPI };
