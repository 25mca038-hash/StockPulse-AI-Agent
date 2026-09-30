import { useState, type FormEvent } from 'react'
import type { InventoryItem } from '../types/inventory'

interface StockAdjustModalProps {
  product: InventoryItem
  onClose: () => void
  onUpdate: (newQuantity: number) => void
}

function StockAdjustModal({
  product,
  onClose,
  onUpdate
}: StockAdjustModalProps) {

  const [adjustment, setAdjustment] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()

    const change = Number(adjustment)

    if (adjustment === '' || Number.isNaN(change)) {
      alert('Please enter a valid stock adjustment.')
      return
    }

    const newQuantity = product.quantity + change

    if (newQuantity < 0) {
      alert('Stock quantity cannot be negative.')
      return
    }

    onUpdate(newQuantity)
  }

  return (
    <div className="modal-overlay">

      <div className="modal">

        <div className="modal-header">

          <h2>Adjust Stock</h2>

          <button
            type="button"
            className="close-button"
            onClick={onClose}
          >
            ×
          </button>

        </div>

        <div className="stock-product-info">

          <h3>{product.name}</h3>

          <p>
            Current Stock: <strong>{product.quantity}</strong>
          </p>

        </div>

        <form onSubmit={handleSubmit}>

          <div className="form-group">

            <label>Stock Adjustment</label>

            <input
              type="number"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              placeholder="Example: 10 or -5"
            />

            <small>
              Use a positive number to add stock and a negative
              number to remove stock.
            </small>

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
              Update Stock
            </button>

          </div>

        </form>

      </div>

    </div>
  )
}

export default StockAdjustModal