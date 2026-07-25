const db = require('./db');

const shop = 'shahbazsevnns.myshopify.com';

(async () => {
  await db.init();
  await db.saveChart({
    shop,
    name: 'Standard Apparel',
    unit: 'cm',
    headers: ['Chest', 'Waist', 'Hips'],
    rows: [
      { size: 'S', values: ['88-92', '72-76', '92-96'] },
      { size: 'M', values: ['96-100', '80-84', '100-104'] },
      { size: 'L', values: ['104-108', '88-92', '108-112'] }
    ],
    apply_to: 'types',
    types: 'Shirt,T-Shirt',
    tags: '',
    products: ''
  });

  await db.saveFitFinder({
    shop,
    questions: [
      { text: 'How do you prefer your fit?', options: ['Tight', 'Regular', 'Loose'] },
      { text: 'What is your chest measurement?', options: ['< 90 cm', '90-100 cm', '> 100 cm'] }
    ],
    results: [
      { size: 'S', scores: [0, 0] },
      { size: 'M', scores: [1, 1] },
      { size: 'L', scores: [2, 2] }
    ]
  });

  console.log('Seeded size guide and fit finder for', shop);
  process.exit(0);
})().catch(err => {
  console.error('Seed failed', err);
  process.exit(1);
});
