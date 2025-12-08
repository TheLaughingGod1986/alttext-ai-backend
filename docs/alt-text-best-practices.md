# Alt Text Best Practices - Accessibility & SEO Optimization

## Overview

This document explains how alt text is optimized for both **accessibility (WCAG 2.1 Level AA)** and **SEO** in our system.

---

## Optimal Length Guidelines

### Character Limits

| Guideline | Recommendation | Reason |
|-----------|----------------|--------|
| **Minimum** | 10 words (~50 chars) | Too short lacks descriptive value |
| **Optimal** | 10-15 words (75-125 chars) | Best for screen readers and SEO |
| **Maximum** | 125 characters | Some screen readers truncate after 125 chars |
| **Hard Limit** | 150 characters | HTML attribute limitations |

### Why 10-15 Words?

1. **Accessibility:**
   - Screen readers read at ~150-200 words/minute
   - 10-15 words = 3-5 seconds of reading time
   - Long enough to convey meaning, short enough to not frustrate users

2. **SEO:**
   - Google indexes alt text for image search
   - 10-15 words allows 2-3 relevant keywords naturally
   - Longer text dilutes keyword density
   - Shorter text misses ranking opportunities

3. **User Experience:**
   - Descriptive without being verbose
   - Works well in tooltips on hover
   - Appears properly in image search results

---

## Current Implementation

### System Prompt (Optimized)

```
Expert at WCAG 2.1 Level AA alt text optimized for accessibility and SEO.
Write natural, keyword-rich descriptions (10-15 words, 125 chars max).
Be specific and descriptive.
```

**Key Improvements:**
- ✅ References WCAG 2.1 Level AA standard
- ✅ Specifies exact length (10-15 words, 125 chars)
- ✅ Emphasizes "natural, keyword-rich" (not keyword stuffing)
- ✅ Encourages specificity

### User Prompt (Optimized)

```
Write descriptive alternative text for this image.

Requirements:
- Length: 10-15 words (125 characters max for optimal accessibility/SEO)
- Include relevant keywords naturally based on context
- Describe: subjects, actions, setting, visible text
- For logos/icons: state brand name and recognizable elements
- Avoid filler: "image of", "picture of", "photo of"
- Be specific: "woman presenting sales chart" vs "woman at computer"

Context (use for keyword relevance):
- Page: About Us - Our Team
- File: ceo-headshot-jane-doe
```

**Key Improvements:**
- ✅ Specific length requirements
- ✅ Keyword integration guidance
- ✅ Context-awareness for SEO
- ✅ Examples of good vs bad alt text
- ✅ Filename keyword extraction

---

## WCAG 2.1 Level AA Compliance

### Success Criterion 1.1.1 (Non-text Content)

**Requirement:** All non-text content has a text alternative that serves the equivalent purpose.

**Our Implementation:**
```
✅ Descriptive of visual content
✅ Conveys meaning/purpose of image
✅ Includes visible text verbatim
✅ Identifies logos/brands
✅ Describes functional images (buttons, links)
```

### What We DO

✅ **Describe visible elements:**
- "Woman presenting quarterly sales chart to business team"
- "Red and white stop sign at intersection"
- "Nike swoosh logo in black"

✅ **Include visible text:**
- "Contact Us button with blue background"
- "Sale banner reading 50% off all items"

✅ **Provide context:**
- "CEO headshot: professional portrait in office"
- "Product photo: blue running shoes on white background"

✅ **Be specific:**
- "Golden retriever puppy playing with tennis ball in backyard"
- NOT: "Dog outside"

### What We AVOID

❌ **Filler phrases:**
- "image of", "picture of", "photo of"
- "graphic showing", "illustration of"

❌ **Redundancy:**
- Don't say "photo" (it's already in an `<img>` tag)
- Don't repeat nearby text content

❌ **Excessive detail:**
- "Woman with brown hair wearing blue shirt sitting at desk with laptop and coffee cup near window with blinds"
- Better: "Woman working on laptop at office desk"

❌ **Subjective interpretations:**
- "Beautiful sunset over ocean" → "Orange and pink sunset over ocean"
- "Delicious pizza" → "Pepperoni pizza with melted cheese"

---

## SEO Optimization

### Keyword Integration

**Best Practice: 2-3 relevant keywords naturally integrated**

#### Example 1: E-commerce Product
```
Context: Product page for "Blue Running Shoes"
Good Alt Text: "Nike Air Zoom blue running shoes with white sole"
Keywords: Nike, blue, running shoes (natural integration)

Bad Alt Text: "Shoes"
Problem: No keywords, not descriptive

Bad Alt Text: "Nike running shoes blue athletic footwear sneakers trainers"
Problem: Keyword stuffing, unnatural
```

#### Example 2: Blog Post Image
```
Context: Blog post titled "How to Start a Garden"
Good Alt Text: "Woman planting tomato seedlings in raised garden bed"
Keywords: garden, planting, tomato (relevant to content)

Bad Alt Text: "Gardening tips vegetable garden outdoor landscaping"
Problem: Just keywords, not a description
```

#### Example 3: Logo
```
Context: Company header
Good Alt Text: "Acme Corporation logo with red mountain icon"
Keywords: Acme Corporation, logo

Bad Alt Text: "Logo"
Problem: No brand identification
```

### SEO Benefits of Optimized Alt Text

1. **Image Search Rankings:**
   - Google Images indexes alt text
   - Descriptive + keywords = better image search visibility
   - Images can drive 20-30% of search traffic for visual industries

2. **Page SEO:**
   - Alt text contributes to overall page keyword relevance
   - Helps Google understand page topic
   - Improved accessibility = better Core Web Vitals score

3. **Link Equity:**
   - If image is a link, alt text is the "anchor text"
   - Descriptive alt text passes more SEO value

4. **Featured Snippets:**
   - Google may pull images with good alt text into featured snippets
   - Increases visibility in "position zero"

---

## Context Awareness

### How We Use Context

The system receives context from WordPress to make alt text more relevant:

```javascript
{
  "post_title": "10 Tips for Small Business Marketing",
  "image_data": {
    "title": "Social Media Marketing",
    "filename": "social-media-strategy-2024.jpg"
  }
}
```

**Generated Alt Text:**
```
"Business owner analyzing social media marketing metrics on laptop"
```

**Why This Works:**
- ✅ Includes "business" (from post title)
- ✅ Includes "social media marketing" (from image title)
- ✅ Includes "metrics" (relevant keyword)
- ✅ 9 words, 67 characters (optimal length)

### Filename Keyword Extraction

We automatically clean and extract keywords from filenames:

```javascript
// Filename: "ceo-headshot-john-smith.jpg"
// Extracted: "ceo headshot john smith"
// Used in prompt to suggest relevant keywords
```

This helps generate:
```
"CEO John Smith professional headshot portrait"
```

Instead of generic:
```
"Man in suit smiling at camera"
```

---

## Special Cases

### Decorative Images

**When to use:** Purely decorative images that don't convey information.

**Implementation:**
```html
<img src="decorative-border.png" alt="">
```

**Our System:** Currently doesn't handle this automatically. Consider adding a `decorative: true` flag in the API request.

### Complex Images (Charts, Diagrams)

**When to use:** Data visualizations, infographics, charts.

**Best Practice:**
```
Alt Text (brief): "Quarterly revenue chart showing 25% growth"
+ Long Description (detailed): "Bar chart showing quarterly revenue: Q1 $100k, Q2 $120k, Q3 $125k, Q4 $125k, representing 25% year-over-year growth."
```

**Our System:** Currently generates brief alt text. For complex images, consider:
- Adding data points in caption
- Using `aria-describedby` for long descriptions
- Providing data table alternative

### Functional Images (Buttons, Links)

**When to use:** Images that are clickable/interactive.

**Best Practice:**
```html
<!-- Icon button -->
<button><img src="search-icon.svg" alt="Search"></button>

<!-- Logo link -->
<a href="/"><img src="logo.png" alt="Acme Corporation home"></a>
```

**Our System:** Detects functional elements and includes action keywords:
- "Search button icon"
- "Acme Corporation logo - home link"

### Text in Images

**When to use:** Images containing readable text (memes, quotes, signs).

**Best Practice:** Include the text verbatim in alt text.

```
Good: "Motivational quote: The only way to do great work is to love what you do"
Bad: "Inspirational poster"
```

**Our System:** GPT-4o-mini can read text in images and includes it in alt text automatically.

---

## Quality Metrics

### How to Measure Alt Text Quality

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Average Length** | 10-15 words | Track word count in logs |
| **Character Count** | 75-125 chars | Track character count |
| **Keyword Inclusion** | 80%+ have 2+ keywords | Manual review of samples |
| **WCAG Compliance** | 100% | Accessibility audit tools |
| **SEO Impact** | Track image search traffic | Google Search Console |
| **User Satisfaction** | >90% | Survey users with screen readers |

### Monitoring in Production

```javascript
// Example log output
{
  "alt_text": "Woman presenting quarterly sales chart to business team",
  "word_count": 8,
  "char_count": 61,
  "has_keywords": true,
  "keywords_detected": ["business", "sales", "presentation"],
  "context_match": true,
  "wcag_compliant": true,
  "quality_score": 9.2
}
```

---

## Examples: Good vs Bad

### Example 1: Product Photography

**❌ Bad Alt Text:**
```
"IMG_1234.jpg"
"Product image"
"Click to enlarge"
```

**✅ Good Alt Text:**
```
"Red leather handbag with gold chain strap"
"iPhone 15 Pro in titanium blue with triple camera"
"Organic cotton t-shirt in navy with crew neck"
```

### Example 2: Team Photos

**❌ Bad Alt Text:**
```
"Team photo"
"Our staff"
"Group of people"
```

**✅ Good Alt Text:**
```
"Marketing team of six people gathered around conference table"
"CEO Jane Smith presenting at annual company meeting"
"Customer service representatives assisting clients"
```

### Example 3: Blog Post Images

**❌ Bad Alt Text:**
```
"Blog image 1"
"Featured image"
"Landscape"
```

**✅ Good Alt Text:**
```
"Laptop displaying code editor for web development tutorial"
"Chef preparing fresh pasta in restaurant kitchen"
"Mountain hiker viewing sunset from rocky summit"
```

### Example 4: Icons and Logos

**❌ Bad Alt Text:**
```
"Logo"
"Icon"
"Social media"
```

**✅ Good Alt Text:**
```
"Facebook logo icon linking to company page"
"Acme Corporation blue hexagon logo"
"Download PDF icon button"
```

---

## Testing Checklist

### Before Deploying Alt Text Changes

- [ ] **Length Check:** 75-125 characters for 80%+ of images
- [ ] **Keyword Check:** Relevant keywords naturally integrated
- [ ] **Context Check:** Alt text relates to page content
- [ ] **Screen Reader Test:** Test with NVDA/JAWS/VoiceOver
- [ ] **SEO Test:** Check Google Search Console for image impressions
- [ ] **WCAG Audit:** Run axe DevTools or WAVE
- [ ] **User Testing:** Get feedback from users with disabilities

### Tools for Testing

1. **Screen Readers:**
   - NVDA (Windows, free): https://www.nvaccess.org/
   - JAWS (Windows, paid): https://www.freedomscientific.com/
   - VoiceOver (Mac/iOS, built-in)

2. **Accessibility Audits:**
   - axe DevTools: https://www.deque.com/axe/
   - WAVE: https://wave.webaim.org/
   - Lighthouse (Chrome DevTools)

3. **SEO Analysis:**
   - Google Search Console
   - Ahrefs Image Search
   - SEMrush Site Audit

---

## Implementation Status

### ✅ Already Implemented

- [x] Optimal length enforcement (10-15 words, 125 chars)
- [x] WCAG 2.1 Level AA compliant prompt
- [x] Keyword integration from context
- [x] Filename keyword extraction
- [x] Filler phrase avoidance
- [x] Specificity encouragement
- [x] Page title context awareness

### 🚧 Future Enhancements

- [ ] Automatic detection of decorative images
- [ ] Long description generation for complex images
- [ ] A/B testing different alt text styles
- [ ] User feedback collection
- [ ] Multilingual alt text generation
- [ ] Industry-specific templates (e-commerce, blog, portfolio)

---

## FAQ

### Q: Why 125 characters max?

**A:** Multiple reasons:
1. Some screen readers truncate after 125 characters
2. Google's image search displays ~120 characters
3. HTML attributes should be concise
4. Forces focus on essential information

### Q: Should I include emotion/mood?

**A:** Only if objectively observable:
- ✅ "Child smiling while opening birthday present"
- ❌ "Happy child" (happiness is subjective)

### Q: What about brand names?

**A:** Always include brand names for:
- Logos
- Branded products
- Company references

Example: "Nike Air Jordan sneakers" not "Athletic shoes"

### Q: How many keywords is too many?

**A:** General rule: 2-3 keywords maximum in 10-15 words. More than that feels unnatural.

### Q: Should alt text match nearby text?

**A:** No! Avoid redundancy:
```html
<h2>Blue Running Shoes</h2>
<img src="shoes.jpg" alt="Nike Air Zoom blue running shoes with white sole">
<!-- Alt text adds value beyond the heading -->
```

### Q: What about decorative images?

**A:** Use empty alt: `<img src="border.png" alt="">`
But be conservative - most images convey *some* meaning.

---

## Resources

### Official Guidelines

- [WCAG 2.1 Success Criterion 1.1.1](https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html)
- [W3C Alt Text Decision Tree](https://www.w3.org/WAI/tutorials/images/decision-tree/)
- [WebAIM Alt Text Guide](https://webaim.org/techniques/alttext/)

### SEO Resources

- [Google Image SEO Best Practices](https://developers.google.com/search/docs/appearance/google-images)
- [Moz Image Optimization](https://moz.com/learn/seo/image-optimization)

### Testing Tools

- [NVDA Screen Reader](https://www.nvaccess.org/)
- [axe DevTools](https://www.deque.com/axe/)
- [WAVE Web Accessibility Tool](https://wave.webaim.org/)

---

## Changelog

### 2025-12-08 - v2.0
- Optimized prompt for 10-15 words (125 chars max)
- Added WCAG 2.1 Level AA reference
- Improved keyword integration from context
- Added filename keyword extraction
- Enhanced specificity guidance

### Previous
- v1.0: Basic alt text generation with 8-16 word target
