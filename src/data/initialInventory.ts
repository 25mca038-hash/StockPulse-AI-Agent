import type { InventoryItem } from '../types/inventory'

export const initialInventory: InventoryItem[] = [
  {
    id: 1,
    name: 'Laptop',
    category: 'Electronics',
    quantity: 25,
    price: 55000,
    minimumStock: 10,
    supplier: 'Tech Supplies Ltd'
  },
  {
    id: 2,
    name: 'Keyboard',
    category: 'Accessories',
    quantity: 8,
    price: 1200,
    minimumStock: 10,
    supplier: 'Computer World'
  },
  {
    id: 3,
    name: 'Mouse',
    category: 'Accessories',
    quantity: 4,
    price: 700,
    minimumStock: 10,
    supplier: 'Computer World'
  },
  {
    id: 4,
    name: 'Monitor',
    category: 'Electronics',
    quantity: 15,
    price: 12000,
    minimumStock: 5,
    supplier: 'Display Tech'
  },
  {
    id: 5,
    name: 'USB Cable',
    category: 'Accessories',
    quantity: 0,
    price: 350,
    minimumStock: 10,
    supplier: 'Cable Store'
  }
]