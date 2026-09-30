import express from 'express'
import cors from 'cors'
import 'dotenv/config'

const app = express()

app.use(
  cors({
    origin: 'http://localhost:5173'
  })
)

app.use(express.json())

const PORT = Number(process.env.PORT) || 3000
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY

if (!NVIDIA_API_KEY) {
  console.error('NVIDIA_API_KEY is missing in .env file')
  process.exit(1)
}


// ==========================================
// TOOL 1: CHECK INVENTORY
// ==========================================

function checkInventory(inventory: any[]) {
  return inventory.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    minimumStock: item.minimumStock,
    price: item.price,
    supplier: item.supplier,

    status:
      item.quantity === 0
        ? 'Out of Stock'
        : item.quantity < item.minimumStock
        ? 'Low Stock'
        : 'In Stock'
  }))
}


// ==========================================
// TOOL 2: UPDATE STOCK
// ==========================================

function updateStock(
  inventory: any[],
  productName: string,
  quantityToAdd: number
) {
  const product = inventory.find(
    (item) =>
      item.name.toLowerCase() ===
      productName.toLowerCase()
  )

  if (!product) {
    return {
      success: false,
      message:
        `Product "${productName}" was not found.`
    }
  }

  const oldQuantity = product.quantity

  const newQuantity =
    product.quantity + quantityToAdd

  // Prevent negative inventory
  if (newQuantity < 0) {
    return {
      success: false,
      message:
        `Cannot remove ${Math.abs(quantityToAdd)} units from ${product.name}. ` +
        `Only ${product.quantity} units are currently available.`
    }
  }

  product.quantity = newQuantity

  return {
    success: true,
    product: product.name,
    oldQuantity,
    quantityAdded: quantityToAdd,
    newQuantity: product.quantity,
    minimumStock: product.minimumStock,

    status:
      product.quantity === 0
        ? 'Out of Stock'
        : product.quantity < product.minimumStock
        ? 'Low Stock'
        : 'In Stock'
  }
}


// ==========================================
// TOOL 3: LOW STOCK ALERT
// ==========================================

function lowStockAlert(inventory: any[]) {
  const lowStockProducts = inventory
    .filter(
  (item) =>
    item.quantity < item.minimumStock
)
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      minimumStock: item.minimumStock,

      shortage: Math.max(
        item.minimumStock - item.quantity,
        0
      ),

      supplier: item.supplier,

      status:
        item.quantity === 0
          ? 'Out of Stock'
          : 'Low Stock'
    }))

  return {
    totalAlerts: lowStockProducts.length,
    products: lowStockProducts
  }
}


// ==========================================
// TOOL 4: AUTOMATIC RESTOCK
// ==========================================

function restockProduct(
  inventory: any[],
  productName: string
) {
  const product = inventory.find(
    (item) =>
      item.name.toLowerCase() ===
      productName.toLowerCase()
  )

  if (!product) {
    return {
      success: false,
      message:
        `Product "${productName}" was not found.`
    }
  }

  const oldQuantity = product.quantity

  // Already has enough stock
  if (
    product.quantity >=
    product.minimumStock
  ) {
    return {
      success: false,
      alreadySufficient: true,
      product: product.name,
      oldQuantity,
      newQuantity: product.quantity,
      minimumStock: product.minimumStock,

      message:
        `${product.name} already has sufficient stock. ` +
        `Current quantity is ${product.quantity}, ` +
        `minimum stock is ${product.minimumStock}.`
    }
  }

  // Calculate how many units are required
  const quantityNeeded =
    product.minimumStock -
    product.quantity

  // Add required quantity
  product.quantity =
    product.quantity + quantityNeeded

  return {
    success: true,
    product: product.name,
    oldQuantity,
    quantityAdded: quantityNeeded,
    newQuantity: product.quantity,
    minimumStock: product.minimumStock,
    supplier: product.supplier,

    status:
      product.quantity >=
      product.minimumStock
        ? 'In Stock'
        : 'Low Stock'
  }
}


// ==========================================
// HELPER: PARSE AI PLANNER RESPONSE
// ==========================================

function parsePlannerResponse(
  plannerResponse: string
) {
  let cleaned = plannerResponse.trim()

  // Remove Markdown code fences
  cleaned = cleaned
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  // Try direct JSON parsing
  try {
    return JSON.parse(cleaned)
  } catch {
    // Continue to extraction
  }

  // Try to find JSON object inside response
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')

  if (start !== -1 && end !== -1) {
    const jsonText =
      cleaned.substring(start, end + 1)

    try {
      return JSON.parse(jsonText)
    } catch {
      // Continue to fallback
    }
  }

  return null
}


// ==========================================
// AI AGENT PLANNER
// ==========================================

async function chooseAgentTool(
  question: string
) {
  const response = await fetch(
    'https://integrate.api.nvidia.com/v1/chat/completions',
    {
      method: 'POST',

      headers: {
        Authorization:
          `Bearer ${NVIDIA_API_KEY}`,

        'Content-Type':
          'application/json',

        Accept:
          'application/json'
      },

      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',

        messages: [
          {
            role: 'system',

            content: `
You are the decision-making brain of StockPulse AI.

Understand the user's request and choose exactly ONE inventory tool.

AVAILABLE TOOLS:

1. check_inventory

Use for:
- checking inventory
- checking stock levels
- available products
- general inventory information

Return:

{
  "tool": "check_inventory",
  "reason": "short explanation"
}


2. update_stock

Use when the user wants to:
- add a specific number of units
- remove a specific number of units
- increase stock by a specific number
- decrease stock by a specific number

Return:

{
  "tool": "update_stock",
  "productName": "exact product name",
  "quantity": 10,
  "reason": "short explanation"
}

For removing stock, quantity must be negative.


3. low_stock_alert

Use when the user asks:
- which products need restocking
- which products are low in stock
- what should be reordered
- which products are running low
- show low stock products
- show products needing restock

Return:

{
  "tool": "low_stock_alert",
  "reason": "short explanation"
}


4. restock_product

Use when the user directly asks to:
- restock a specific product
- refill a specific product
- replenish a specific product
- automatically restock a product
- bring a product back to minimum stock

Examples:

"Restock the Mouse"

"Restock Mouse"

"Replenish the USB Cable"

"Refill the Keyboard"

Return:

{
  "tool": "restock_product",
  "productName": "exact product name",
  "reason": "short explanation"
}


IMPORTANT:

Return ONLY valid JSON.

Do not use Markdown.

Do not add explanations outside the JSON.

Use the exact product name whenever possible.
`
          },

          {
            role: 'user',
            content: question
          }
        ],

        temperature: 0,

        max_tokens: 500,

        stream: false
      })
    }
  )

  if (!response.ok) {
    const errorText =
      await response.text()

    console.error(
      'Agent Planner Error:',
      errorText
    )

    throw new Error(
      'Agent planner request failed'
    )
  }

  const data =
    await response.json()

  // Print the complete planner response
  // for debugging.
  console.log(
    'Planner API Response:',
    JSON.stringify(data, null, 2)
  )

  let plannerResponse =
    data?.choices?.[0]?.message?.content

  // Some models may place the response
  // inside reasoning_content.
  if (!plannerResponse) {
    plannerResponse =
      data?.choices?.[0]?.message?.reasoning_content
  }

  // Another possible response location.
  if (!plannerResponse) {
    plannerResponse =
      data?.choices?.[0]?.text
  }

  // If the model returned usable content,
  // parse it.
  if (plannerResponse) {
    console.log(
      'Planner Response Text:',
      plannerResponse
    )

    const decision =
      parsePlannerResponse(
        plannerResponse
      )

    if (decision) {
      return decision
    }

    console.log(
      'Planner returned text but it was not valid JSON.'
    )
  }

  // ========================================
  // FALLBACK DECISION
  // ========================================
  //
  // If the model does not return a usable
  // decision, use simple keyword detection.
  // This prevents the agent from crashing.
  //

  const lowerQuestion =
    question.toLowerCase()

  // Restock specific product
  if (
    lowerQuestion.includes('restock') ||
    lowerQuestion.includes('replenish') ||
    lowerQuestion.includes('refill')
  ) {
    let productName = ''

    if (
      lowerQuestion.includes('mouse')
    ) {
      productName = 'Mouse'
    } else if (
      lowerQuestion.includes('keyboard')
    ) {
      productName = 'Keyboard'
    } else if (
      lowerQuestion.includes('laptop')
    ) {
      productName = 'Laptop'
    } else if (
      lowerQuestion.includes('monitor')
    ) {
      productName = 'Monitor'
    } else if (
      lowerQuestion.includes('usb cable')
    ) {
      productName = 'USB Cable'
    }

    if (productName) {
      return {
        tool: 'restock_product',
        productName,
        reason:
          `User requested restocking of ${productName}`
      }
    }

    return {
      tool: 'low_stock_alert',
      reason:
        'User requested restocking information'
    }
  }

  // Add/remove stock
  if (
    lowerQuestion.includes('add') ||
    lowerQuestion.includes('remove') ||
    lowerQuestion.includes('increase') ||
    lowerQuestion.includes('decrease')
  ) {
    let productName = ''

    if (
      lowerQuestion.includes('mouse')
    ) {
      productName = 'Mouse'
    } else if (
      lowerQuestion.includes('keyboard')
    ) {
      productName = 'Keyboard'
    } else if (
      lowerQuestion.includes('laptop')
    ) {
      productName = 'Laptop'
    } else if (
      lowerQuestion.includes('monitor')
    ) {
      productName = 'Monitor'
    } else if (
      lowerQuestion.includes('usb cable')
    ) {
      productName = 'USB Cable'
    }

    const numberMatch =
      lowerQuestion.match(/\d+/)

    const number =
      numberMatch
        ? Number(numberMatch[0])
        : 0

    const quantity =
      lowerQuestion.includes('remove') ||
      lowerQuestion.includes('decrease')
        ? -number
        : number

    if (
      productName &&
      number > 0
    ) {
      return {
        tool: 'update_stock',
        productName,
        quantity,
        reason:
          `User requested a stock quantity change for ${productName}`
      }
    }
  }

  // Low stock questions
  if (
    lowerQuestion.includes('low stock') ||
    lowerQuestion.includes('need restock') ||
    lowerQuestion.includes('need restocking') ||
    lowerQuestion.includes('running low') ||
    lowerQuestion.includes('reorder')
  ) {
    return {
      tool: 'low_stock_alert',
      reason:
        'User wants products that need restocking'
    }
  }

  // Default
  return {
    tool: 'check_inventory',
    reason:
      'User requested inventory information'
  }
}


// ==========================================
// MAIN AI AGENT
// ==========================================

app.post(
  '/api/agent',
  async (req, res) => {
    try {
      const {
        question,
        inventory
      } = req.body

      if (
        !question ||
        !Array.isArray(inventory)
      ) {
        return res.status(400).json({
          error:
            'Question and inventory are required.'
        })
      }


      // =====================================
      // STEP 1: AGENT DECISION
      // =====================================

      const decision =
        await chooseAgentTool(question)

      console.log(
        'Agent Decision:',
        decision
      )


      // =====================================
      // TOOL 1: CHECK INVENTORY
      // =====================================

      if (
        decision.tool ===
        'check_inventory'
      ) {
        const inventoryResult =
          checkInventory(inventory)

        const analysisResponse =
          await fetch(
            'https://integrate.api.nvidia.com/v1/chat/completions',
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${NVIDIA_API_KEY}`,

                'Content-Type':
                  'application/json',

                Accept:
                  'application/json'
              },

              body: JSON.stringify({
                model:
                  'openai/gpt-oss-20b',

                messages: [
                  {
                    role: 'system',

                    content: `
You are StockPulse AI.

You have used the check_inventory tool.

Analyze the result and answer the user's question.

Rules:
- Identify low-stock products.
- Identify out-of-stock products.
- Be concise.
- Use a Markdown table when useful.
- Do not invent information.
`
                  },

                  {
                    role: 'user',

                    content: `
User Question:
${question}

Tool Result:
${JSON.stringify(
  inventoryResult,
  null,
  2
)}
`
                  }
                ],

                temperature: 0.2,
                max_tokens: 1024,
                stream: false
              })
            }
          )

        if (!analysisResponse.ok) {
          return res.status(500).json({
            error:
              'Agent analysis failed.'
          })
        }

        const analysisData =
          await analysisResponse.json()

        const aiResponse =
          analysisData?.choices?.[0]
            ?.message?.content ||
          'The agent completed the inventory check.'

        return res.json({
          response: aiResponse,
          agent:
            'StockPulse AI Agent',
          tool:
            decision.tool,
          reason:
            decision.reason,
          result:
            inventoryResult
        })
      }


      // =====================================
      // TOOL 2: UPDATE STOCK
      // =====================================

      if (
        decision.tool ===
        'update_stock'
      ) {
        const productName =
          decision.productName

        const quantity =
          Number(decision.quantity)

        if (
          !productName ||
          Number.isNaN(quantity)
        ) {
          return res.status(400).json({
            error:
              'Invalid product name or quantity.'
          })
        }

        const updateResult =
          updateStock(
            inventory,
            productName,
            quantity
          )

        if (!updateResult.success) {
          return res.json({
            response:
              updateResult.message,

            agent:
              'StockPulse AI Agent',

            tool:
              decision.tool,

            reason:
              decision.reason,

            result:
              updateResult
          })
        }

        const analysisResponse =
          await fetch(
            'https://integrate.api.nvidia.com/v1/chat/completions',
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${NVIDIA_API_KEY}`,

                'Content-Type':
                  'application/json',

                Accept:
                  'application/json'
              },

              body: JSON.stringify({
                model:
                  'openai/gpt-oss-20b',

                messages: [
                  {
                    role: 'system',

                    content: `
You are StockPulse AI.

The update_stock tool has been executed.

Explain:
- Product
- Previous quantity
- Quantity added or removed
- New quantity
- Current status

Be concise.
Do not invent information.
`
                  },

                  {
                    role: 'user',

                    content: `
User Question:
${question}

Tool Result:
${JSON.stringify(
  updateResult,
  null,
  2
)}
`
                  }
                ],

                temperature: 0.2,
                max_tokens: 500,
                stream: false
              })
            }
          )

        if (!analysisResponse.ok) {
          return res.json({
            response:
              `Stock updated successfully. ${updateResult.product} quantity changed from ${updateResult.oldQuantity} to ${updateResult.newQuantity}.`,

            agent:
              'StockPulse AI Agent',

            tool:
              decision.tool,

            reason:
              decision.reason,

            result:
              updateResult
          })
        }

        const analysisData =
          await analysisResponse.json()

        const aiResponse =
          analysisData?.choices?.[0]
            ?.message?.content ||

          `Stock updated successfully. ${updateResult.product} quantity changed from ${updateResult.oldQuantity} to ${updateResult.newQuantity}.`

        return res.json({
          response: aiResponse,
          agent:
            'StockPulse AI Agent',
          tool:
            decision.tool,
          reason:
            decision.reason,
          result:
            updateResult
        })
      }


      // =====================================
      // TOOL 3: LOW STOCK ALERT
      // =====================================

      if (
        decision.tool ===
        'low_stock_alert'
      ) {
        const alertResult =
          lowStockAlert(inventory)

        const analysisResponse =
          await fetch(
            'https://integrate.api.nvidia.com/v1/chat/completions',
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${NVIDIA_API_KEY}`,

                'Content-Type':
                  'application/json',

                Accept:
                  'application/json'
              },

              body: JSON.stringify({
                model:
                  'openai/gpt-oss-20b',

                messages: [
                  {
                    role: 'system',

                    content: `
You are StockPulse AI.

The low_stock_alert tool has been executed.

Explain which products need restocking.

Include:
- Product
- Status
- Quantity
- Minimum stock
- Supplier when useful

Use a Markdown table when multiple products exist.

If there are no alerts, say all products have sufficient stock.

Do not invent information.
`
                  },

                  {
                    role: 'user',

                    content: `
User Question:
${question}

Tool Result:
${JSON.stringify(
  alertResult,
  null,
  2
)}
`
                  }
                ],

                temperature: 0.2,
                max_tokens: 800,
                stream: false
              })
            }
          )

        if (!analysisResponse.ok) {
          return res.json({
            response:
              `The low stock check found ${alertResult.totalAlerts} product(s) needing attention.`,

            agent:
              'StockPulse AI Agent',

            tool:
              decision.tool,

            reason:
              decision.reason,

            result:
              alertResult
          })
        }

        const analysisData =
          await analysisResponse.json()

        const aiResponse =
          analysisData?.choices?.[0]
            ?.message?.content ||

          `The low stock check found ${alertResult.totalAlerts} product(s) needing attention.`

        return res.json({
          response: aiResponse,
          agent:
            'StockPulse AI Agent',
          tool:
            decision.tool,
          reason:
            decision.reason,
          result:
            alertResult
        })
      }


      // =====================================
      // TOOL 4: AUTOMATIC RESTOCK
      // =====================================

      if (
        decision.tool ===
        'restock_product'
      ) {
        const productName =
          decision.productName

        if (!productName) {
          return res.status(400).json({
            error:
              'Product name is required.'
          })
        }

        const restockResult =
          restockProduct(
            inventory,
            productName
          )

        // Product not found OR already sufficient
        if (!restockResult.success) {
          return res.json({
            response:
              restockResult.message,

            agent:
              'StockPulse AI Agent',

            tool:
              decision.tool,

            reason:
              decision.reason,

            result:
              restockResult
          })
        }

        // Explain completed restocking
        const analysisResponse =
          await fetch(
            'https://integrate.api.nvidia.com/v1/chat/completions',
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${NVIDIA_API_KEY}`,

                'Content-Type':
                  'application/json',

                Accept:
                  'application/json'
              },

              body: JSON.stringify({
                model:
                  'openai/gpt-oss-20b',

                messages: [
                  {
                    role: 'system',

                    content: `
You are StockPulse AI.

The restock_product tool has been executed.

Explain the automatic restocking result.

Include:
- Product name
- Previous quantity
- Quantity added
- New quantity
- Minimum stock
- Supplier
- Current status

Be concise and easy to understand.

Do not invent information.
`
                  },

                  {
                    role: 'user',

                    content: `
User Question:
${question}

Tool Used:
restock_product

Tool Result:
${JSON.stringify(
  restockResult,
  null,
  2
)}
`
                  }
                ],

                temperature: 0.2,
                max_tokens: 500,
                stream: false
              })
            }
          )

        // If AI explanation fails,
        // still return successful tool result.
        if (!analysisResponse.ok) {
          return res.json({
            response:
              `Restocking completed. ${restockResult.product} quantity changed from ${restockResult.oldQuantity} to ${restockResult.newQuantity}. ${restockResult.quantityAdded} units were added.`,

            agent:
              'StockPulse AI Agent',

            tool:
              decision.tool,

            reason:
              decision.reason,

            result:
              restockResult
          })
        }

        const analysisData =
          await analysisResponse.json()

        const aiResponse =
          analysisData?.choices?.[0]
            ?.message?.content ||

          `Restocking completed. ${restockResult.product} quantity changed from ${restockResult.oldQuantity} to ${restockResult.newQuantity}.`

        return res.json({
          response: aiResponse,
          agent:
            'StockPulse AI Agent',
          tool:
            decision.tool,
          reason:
            decision.reason,
          result:
            restockResult
        })
      }


      // =====================================
      // UNKNOWN TOOL
      // =====================================

      return res.status(400).json({
        error:
          'Unknown agent tool.'
      })

    } catch (error) {

      console.error(
        'Agent Error:',
        error
      )

      return res.status(500).json({
        error:
          'StockPulse AI Agent failed.'
      })
    }
  }
)


// ==========================================
// HEALTH CHECK
// ==========================================

app.get(
  '/api/health',
  (_req, res) => {
    res.json({
      status:
        'StockPulse AI server is running'
    })
  }
)


// ==========================================
// ORIGINAL AI ENDPOINT
// ==========================================

app.post(
  '/api/ai',
  async (req, res) => {
    try {
      const {
        question,
        inventory
      } = req.body

      if (
        !question ||
        !Array.isArray(inventory)
      ) {
        return res.status(400).json({
          error:
            'Question and inventory are required.'
        })
      }

      const inventoryText =
        inventory
          .map(
            (item: {
              name: string
              category: string
              quantity: number
              price: number
              minimumStock: number
              supplier: string
            }) =>
              `Product: ${item.name}
Category: ${item.category}
Quantity: ${item.quantity}
Price: ₹${item.price}
Minimum Stock: ${item.minimumStock}
Supplier: ${item.supplier}`
          )
          .join('\n\n')

      const systemMessage = `
You are StockPulse AI, an inventory management assistant.

Analyze the inventory data provided by the user and answer questions about it.

Rules:
- Use only the inventory information provided.
- Be concise and easy to understand.
- Mention product names when relevant.
- If quantity is below minimum stock, identify it as low stock.
- If quantity is 0, identify it as out of stock.
- Give practical inventory information.
`

      const userMessage = `
Inventory:

${inventoryText}

User Question:
${question}
`

      const response =
        await fetch(
          'https://integrate.api.nvidia.com/v1/chat/completions',
          {
            method: 'POST',

            headers: {
              Authorization:
                `Bearer ${NVIDIA_API_KEY}`,

              'Content-Type':
                'application/json',

              Accept:
                'application/json'
            },

            body: JSON.stringify({
              model:
                'openai/gpt-oss-20b',

              messages: [
                {
                  role: 'system',
                  content: systemMessage
                },

                {
                  role: 'user',
                  content: userMessage
                }
              ],

              temperature: 0.2,
              max_tokens: 1024,
              stream: false
            })
          }
        )

      if (!response.ok) {
        const errorText =
          await response.text()

        console.error(
          'NVIDIA API Error:',
          errorText
        )

        return res.status(
          response.status
        ).json({
          error:
            'NVIDIA AI request failed.'
        })
      }

      const data =
        await response.json()

      const aiResponse =
        data?.choices?.[0]
          ?.message?.content ||
        'I could not generate a response.'

      res.json({
        response: aiResponse
      })

    } catch (error) {

      console.error(
        'Server Error:',
        error
      )

      res.status(500).json({
        error:
          'Failed to connect to NVIDIA AI.'
      })
    }
  }
)


// ==========================================
// START SERVER
// ==========================================

const server = app.listen(
  PORT,
  '127.0.0.1',
  () => {
    console.log(
      `StockPulse AI server running at http://localhost:${PORT}`
    )
  }
)

server.on('error', (error) => {
  console.error(
    'Server error:',
    error
  )
})

process.on('SIGINT', () => {
  console.log(
    'Stopping StockPulse AI server...'
  )

  server.close(() => {
    process.exit(0)
  })
})