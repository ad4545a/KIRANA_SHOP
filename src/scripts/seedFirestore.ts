import { firestore } from '../config/firebase';
import { logger } from '../config/logger';

async function seedFirestore() {
  console.log('🌱 Starting Firestore seeding script...');

  const initialProducts = [
    {
      productId: 'prod-001',
      name: 'Fortune Basmati Rice 5kg',
      category: 'Grains',
      sku: 'RICE-5KG',
      unitType: 'BASE',
      baseUnit: 'g',
      displayUnit: 'kg',
      unitConversionFactor: 1000,
      purchasePrice: 320,
      sellingPrice: 380,
      currentStock: 25000, // 25kg
      minimumStock: 5000,
      gstPercent: 5,
      supplierId: 'SUP-101',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      productId: 'prod-002',
      name: 'Uttam Sugar 1kg',
      category: 'Groceries',
      sku: 'SUGAR-1KG',
      unitType: 'BASE',
      baseUnit: 'g',
      displayUnit: 'kg',
      unitConversionFactor: 1000,
      purchasePrice: 38,
      sellingPrice: 45,
      currentStock: 50000, // 50kg
      minimumStock: 10000,
      gstPercent: 5,
      supplierId: 'SUP-102',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      productId: 'prod-003',
      name: 'Fortune Sunflower Oil 1L',
      category: 'Oils',
      sku: 'OIL-1L',
      unitType: 'BASE',
      baseUnit: 'ml',
      displayUnit: 'L',
      unitConversionFactor: 1000,
      purchasePrice: 135,
      sellingPrice: 155,
      currentStock: 30000, // 30L
      minimumStock: 5000,
      gstPercent: 5,
      supplierId: 'SUP-103',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      productId: 'prod-004',
      name: 'Aashirvaad Shuddh Chakki Atta 5kg',
      category: 'Flour',
      sku: 'ATTA-5KG',
      unitType: 'BASE',
      baseUnit: 'g',
      displayUnit: 'kg',
      unitConversionFactor: 1000,
      purchasePrice: 190,
      sellingPrice: 220,
      currentStock: 40000, // 40kg
      minimumStock: 10000,
      gstPercent: 0,
      supplierId: 'SUP-101',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      productId: 'prod-005',
      name: 'Tata Salt 1kg',
      category: 'Groceries',
      sku: 'SALT-1KG',
      unitType: 'PIECE',
      baseUnit: 'pc',
      displayUnit: 'pc',
      unitConversionFactor: 1,
      purchasePrice: 22,
      sellingPrice: 28,
      currentStock: 100, // 100 packets
      minimumStock: 20,
      gstPercent: 0,
      supplierId: 'SUP-102',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      productId: 'prod-006',
      name: 'Toor Dal 1kg',
      category: 'Pulses',
      sku: 'DAL-TOOR-1KG',
      unitType: 'BASE',
      baseUnit: 'g',
      displayUnit: 'kg',
      unitConversionFactor: 1000,
      purchasePrice: 120,
      sellingPrice: 145,
      currentStock: 20000, // 20kg
      minimumStock: 5000,
      gstPercent: 0,
      supplierId: 'SUP-101',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ];

  const initialCustomers = [
    {
      customerId: 'cust-001',
      name: 'Ramesh Sharma',
      phone: '9876543210',
      address: 'Shop No 4, Main Market, Delhi',
      creditBalance: 450,
      creditLimit: 5000,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      customerId: 'cust-002',
      name: 'Priya Verma',
      phone: '9812345678',
      address: 'B-12, Green Park, Delhi',
      creditBalance: 0,
      creditLimit: 3000,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      customerId: 'cust-003',
      name: 'Amit Patel',
      phone: '9988776655',
      address: 'Block A-3, Sector 62, Noida',
      creditBalance: 1200,
      creditLimit: 10000,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ];

  const initialUsers = [
    {
      uid: 'owner-user-001',
      role: 'OWNER',
      email: 'owner@kirana.com',
      name: 'Kirana Shop Owner',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      uid: 'worker-user-001',
      role: 'WORKER',
      email: 'worker@kirana.com',
      name: 'Shop Worker',
      status: 'ACTIVE',
      maxDiscountAmount: 500,
      maxDiscountPercent: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ];

  try {
    // 1. Seed Products
    for (const prod of initialProducts) {
      await firestore.collection('products').doc(prod.productId).set(prod, { merge: true });
      console.log(`✅ Product seeded: ${prod.name} (${prod.productId})`);
    }

    // 2. Seed Customers
    for (const cust of initialCustomers) {
      await firestore.collection('customers').doc(cust.customerId).set(cust, { merge: true });
      console.log(`✅ Customer seeded: ${cust.name} (${cust.phone})`);
    }

    // 3. Seed Users
    for (const usr of initialUsers) {
      await firestore.collection('users').doc(usr.uid).set(usr, { merge: true });
      console.log(`✅ User seeded: ${usr.name} (${usr.role})`);
    }

    console.log('🎉 Firestore seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Firestore seeding error:', err);
    process.exit(1);
  }
}

seedFirestore();
