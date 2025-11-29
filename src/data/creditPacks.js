/**
 * Credit Packs Catalog
 * Defines available credit packs for purchase
 * Prices are in pence (Stripe requirement)
 */

module.exports = [
  { id: "pack_100", credits: 100, price: 300 }, // £3.00
  { id: "pack_500", credits: 500, price: 1200 }, // £12.00
  { id: "pack_1000", credits: 1000, price: 2000 }, // £20.00
  { id: "pack_2500", credits: 2500, price: 4500 }, // £45.00
];

