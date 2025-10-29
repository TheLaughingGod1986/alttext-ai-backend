/**
 * Stripe Products and Prices Setup
 * Creates products and prices for AltText AI plans
 */

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create Stripe products and prices
 */
async function setupStripeProducts() {
  console.log('Setting up Stripe products and prices...');

  try {
    // 1. Pro Plan - 1000 images/month at £12.99
    const proProduct = await stripe.products.create({
      name: 'AltText AI Pro',
      description: '1000 AI-generated alt texts per month',
      metadata: {
        plan: 'pro',
        images_per_month: '1000'
      }
    });

    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 1299, // £12.99 in pence
      currency: 'gbp',
      recurring: {
        interval: 'month'
      },
      metadata: {
        plan: 'pro'
      }
    });

    // 2. Agency Plan - 10000 images/month at £49.99
    const agencyProduct = await stripe.products.create({
      name: 'AltText AI Agency',
      description: '10000 AI-generated alt texts per month',
      metadata: {
        plan: 'agency',
        images_per_month: '10000'
      }
    });

    const agencyPrice = await stripe.prices.create({
      product: agencyProduct.id,
      unit_amount: 4999, // £49.99 in pence
      currency: 'gbp',
      recurring: {
        interval: 'month'
      },
      metadata: {
        plan: 'agency'
      }
    });

    // 3. Credit Pack - 100 images one-time at £9.99
    const creditProduct = await stripe.products.create({
      name: 'AltText AI Credit Pack',
      description: '100 AI-generated alt texts (one-time purchase)',
      metadata: {
        type: 'credit_pack',
        images: '100'
      }
    });

    const creditPrice = await stripe.prices.create({
      product: creditProduct.id,
      unit_amount: 999, // £9.99 in pence
      currency: 'gbp',
      metadata: {
        type: 'credit_pack'
      }
    });

    console.log('✅ Stripe products and prices created successfully!');
    console.log('\n📋 Environment Variables to Add:');
    console.log(`STRIPE_PRICE_PRO=${proPrice.id}`);
    console.log(`STRIPE_PRICE_AGENCY=${agencyPrice.id}`);
    console.log(`STRIPE_PRICE_CREDITS=${creditPrice.id}`);
    console.log(`STRIPE_PRODUCT_PRO=${proProduct.id}`);
    console.log(`STRIPE_PRODUCT_AGENCY=${agencyProduct.id}`);
    console.log(`STRIPE_PRODUCT_CREDITS=${creditProduct.id}`);

    return {
      pro: { product: proProduct.id, price: proPrice.id },
      agency: { product: agencyProduct.id, price: agencyPrice.id },
      credits: { product: creditProduct.id, price: creditPrice.id }
    };

  } catch (error) {
    console.error('❌ Error setting up Stripe products:', error.message);
    throw error;
  }
}

/**
 * List existing products and prices
 */
async function listStripeProducts() {
  try {
    const products = await stripe.products.list({ limit: 100 });
    const prices = await stripe.prices.list({ limit: 100 });

    console.log('\n📦 Existing Products:');
    products.data.forEach(product => {
      console.log(`- ${product.name} (${product.id})`);
    });

    console.log('\n💰 Existing Prices:');
    prices.data.forEach(price => {
      const amount = price.unit_amount ? (price.unit_amount / 100).toFixed(2) : 'N/A';
      const interval = price.recurring ? `/${price.recurring.interval}` : ' (one-time)';
      console.log(`- £${amount}${interval} (${price.id})`);
    });

  } catch (error) {
    console.error('Error listing products:', error.message);
  }
}

/**
 * Clean up test products (for development)
 */
async function cleanupTestProducts() {
  try {
    const products = await stripe.products.list({ limit: 100 });
    
    for (const product of products.data) {
      if (product.name.includes('AltText AI')) {
        console.log(`Deleting product: ${product.name} (${product.id})`);
        await stripe.products.del(product.id);
      }
    }
    
    console.log('✅ Test products cleaned up');
  } catch (error) {
    console.error('Error cleaning up products:', error.message);
  }
}

// Run setup if called directly
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'setup':
      setupStripeProducts()
        .then(() => {
          console.log('\n🎉 Stripe setup completed!');
          process.exit(0);
        })
        .catch((error) => {
          console.error('Setup failed:', error);
          process.exit(1);
        });
      break;
      
    case 'list':
      listStripeProducts()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error('List failed:', error);
          process.exit(1);
        });
      break;
      
    case 'cleanup':
      cleanupTestProducts()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error('Cleanup failed:', error);
          process.exit(1);
        });
      break;
      
    default:
      console.log('Usage: node setup.js [setup|list|cleanup]');
      process.exit(1);
  }
}

module.exports = {
  setupStripeProducts,
  listStripeProducts,
  cleanupTestProducts
};
