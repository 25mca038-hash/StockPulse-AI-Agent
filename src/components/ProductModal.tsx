import { useState, type FormEvent } from 'react'
import type { InventoryItem } from '../types/inventory'

interface ProductModalProps {
  onClose: () => void
  onAdd: (product: InventoryItem) => void
}

function ProductModal({ onClose, onAdd }: ProductModalProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [minimumStock, setMinimumStock] = useState('')
  const [supplier, setSupplier] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()

    if (!name || !category || !quantity || !price || !minimumStock || !supplier) {
      alert('Please fill in all fields.')
      return
    }

    const newProduct: InventoryItem = {
      id: Date.now(),
      name,
      category,
      quantity: Number(quantity),
      price: Number(price),
      minimumStock: Number(minimumStock),
      supplier
    }

    onAdd(newProduct)
  }

  return (
    <div className="modal-overlay">

      <div className="modal">

        <div className="modal-header">
          <h2>Add New Product</h2>

          <button
            type="button"
            className="close-button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>

          <div className="form-group">
            <label>Product Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter product name"
            />
          </div>

          <div className="form-group">
            <label>Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Electronics"
            />
          </div>

          <div className="form-row">

            <div className="form-group">
              <label>Quantity</label>
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="form-group">
              <label>Price (₹)</label>
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
              />
            </div>

          </div>

          <div className="form-group">
            <label>Minimum Stock</label>
            <input
              type="number"
              min="0"
              value={minimumStock}
              onChange={(e) => setMinimumStock(e.target.value)}
              placeholder="10"
            />
          </div>

          <div className="form-group">
            <label>Supplier</label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Enter supplier name"
            />
          </div>

          <div className="modal-actions">

            <button
              type="button"
              className="cancel-button"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="save-button"
            >
              Add Product
            </button>

          </div>

        </form>

      </div>

    </div>
  )
}

export default ProductModal