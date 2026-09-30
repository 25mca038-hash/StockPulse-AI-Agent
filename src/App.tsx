import { useState } from 'react'
import './App.css'
import { initialInventory } from './data/initialInventory'
import type { InventoryItem } from './types/inventory'
import ProductModal from './components/ProductModal'
import StockAdjustModal from './components/StockAdjustModal'
import AIAgentPanel from './components/AIAgentPanel'

function App() {
  const [inventory, setInventory] =
    useState<InventoryItem[]>(initialInventory)

  const [showProductModal, setShowProductModal] =
    useState(false)

  const [selectedProduct, setSelectedProduct] =
    useState<InventoryItem | null>(null)


  // ==========================================
  // MANUAL STOCK UPDATE
  // ==========================================

  const handleStockUpdate = (newQuantity: number) => {
    if (!selectedProduct) return

    setInventory((currentInventory) =>
      currentInventory.map((item) =>
        item.id === selectedProduct.id
          ? {
              ...item,
              quantity: newQuantity
            }
          : item
      )
    )

    setSelectedProduct(null)
  }


  // ==========================================
  // AI AGENT STOCK UPDATE
  // ==========================================

  const handleAIStockUpdate = (
    productName: string,
    newQuantity: number
  ) => {
    setInventory((currentInventory) =>
      currentInventory.map((item) =>
        item.name.toLowerCase() ===
        productName.toLowerCase()
          ? {
              ...item,
              quantity: newQuantity
            }
          : item
      )
    )
  }


  // ==========================================
  // DASHBOARD METRICS
  // ==========================================

  const totalProducts =
    inventory.length

  const totalStock =
    inventory.reduce(
      (total, item) =>
        total + item.quantity,
      0
    )

  // A product is Low Stock only when
  // quantity is BELOW the minimum stock.
  //
  // Example:
  // Quantity 4 / Minimum 10 = Low Stock
  // Quantity 10 / Minimum 10 = In Stock

  const lowStock =
    inventory.filter(
      (item) =>
        item.quantity > 0 &&
        item.quantity < item.minimumStock
    ).length

  const outOfStock =
    inventory.filter(
      (item) =>
        item.quantity === 0
    ).length


  // ==========================================
  // ADD PRODUCT
  // ==========================================

  const handleAddProduct = (
    product: InventoryItem
  ) => {
    setInventory((currentInventory) => [
      ...currentInventory,
      product
    ])

    setShowProductModal(false)
  }


  // ==========================================
  // UI
  // ==========================================

  return (
    <div className="app">

      {/* =====================================
          HEADER
          ===================================== */}

      <header className="header">

        <div>

          <h1>
            StockPulse AI
          </h1>

          <p>
            AI-Powered Inventory Management
          </p>

        </div>

        <button className="ai-button">
          AI Assistant
        </button>

      </header>


      <main className="dashboard">

        {/* ===================================
            WELCOME
            =================================== */}

        <section className="welcome">

          <h2>
            Inventory Dashboard
          </h2>

          <p>
            Monitor your inventory, stock levels,
            purchase orders, and AI-powered
            insights in one place.
          </p>

        </section>


        {/* ===================================
            METRICS
            =================================== */}

        <section className="metrics">

          <div className="metric-card">

            <span>
              Total Products
            </span>

            <strong>
              {totalProducts}
            </strong>

          </div>


          <div className="metric-card">

            <span>
              Total Stock
            </span>

            <strong>
              {totalStock}
            </strong>

          </div>


          <div className="metric-card">

            <span>
              Low Stock
            </span>

            <strong>
              {lowStock}
            </strong>

          </div>


          <div className="metric-card">

            <span>
              Out of Stock
            </span>

            <strong>
              {outOfStock}
            </strong>

          </div>

        </section>


        {/* ===================================
            INVENTORY
            =================================== */}

        <section className="inventory-section">

          <div className="section-header">

            <div>

              <h2>
                Inventory
              </h2>

              <p>
                Current products in your inventory.
              </p>

            </div>


            <button
              className="add-button"
              onClick={() =>
                setShowProductModal(true)
              }
            >
              + Add Product
            </button>

          </div>


          {/* =================================
              INVENTORY TABLE
              ================================= */}

          <div className="table-container">

            <table>

              <thead>

                <tr>

                  <th>
                    Product
                  </th>

                  <th>
                    Category
                  </th>

                  <th>
                    Quantity
                  </th>

                  <th>
                    Price
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Action
                  </th>

                </tr>

              </thead>


              <tbody>

                {inventory.map((item) => {

                  let status =
                    'In Stock'


                  // OUT OF STOCK

                  if (
                    item.quantity === 0
                  ) {
                    status =
                      'Out of Stock'
                  }


                  // LOW STOCK

                  else if (
                    item.quantity <
                    item.minimumStock
                  ) {
                    status =
                      'Low Stock'
                  }


                  return (
                    <tr
                      key={item.id}
                    >

                      <td>
                        {item.name}
                      </td>

                      <td>
                        {item.category}
                      </td>

                      <td>
                        {item.quantity}
                      </td>

                      <td>
                        ₹
                        {item.price.toLocaleString(
                          'en-IN'
                        )}
                      </td>

                      <td>

                        <span
                          className={
                            `status ${status
                              .toLowerCase()
                              .replaceAll(
                                ' ',
                                '-'
                              )}`
                          }
                        >
                          {status}
                        </span>

                      </td>

                      <td>

                        <button
                          className="adjust-button"
                          onClick={() =>
                            setSelectedProduct(
                              item
                            )
                          }
                        >
                          Adjust Stock
                        </button>

                      </td>

                    </tr>
                  )
                })}

              </tbody>

            </table>

          </div>

        </section>


        {/* ===================================
            AI AGENT
            =================================== */}

        <AIAgentPanel
          inventory={inventory}
          onStockUpdated={
            handleAIStockUpdate
          }
        />

      </main>


      {/* =====================================
          ADD PRODUCT MODAL
          ===================================== */}

      {showProductModal && (

        <ProductModal

          onClose={() =>
            setShowProductModal(false)
          }

          onAdd={
            handleAddProduct
          }

        />

      )}


      {/* =====================================
          STOCK ADJUST MODAL
          ===================================== */}

      {selectedProduct && (

        <StockAdjustModal

          product={
            selectedProduct
          }

          onClose={() =>
            setSelectedProduct(null)
          }

          onUpdate={
            handleStockUpdate
          }

        />

      )}

    </div>
  )
}

export default App