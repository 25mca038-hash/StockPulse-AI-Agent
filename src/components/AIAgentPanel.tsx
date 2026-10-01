import {
  useState,
  type FormEvent,
  type ReactNode
} from 'react'

import type { InventoryItem } from '../types/inventory'


// ==========================================
// FORMAT AI RESPONSE
// ==========================================

function formatAIResponse(
  response: string
): ReactNode {
  const lines = response.split('\n')

  const elements: ReactNode[] = []

  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()

    // Ignore empty lines
    if (!line) {
      i++
      continue
    }


    // ======================================
    // MARKDOWN TABLE
    // ======================================

    if (
      line.startsWith('|') &&
      line.endsWith('|')
    ) {
      const tableRows: string[][] = []

      while (
        i < lines.length &&
        lines[i].trim().startsWith('|') &&
        lines[i].trim().endsWith('|')
      ) {
        const currentLine =
          lines[i].trim()

        // Ignore Markdown separator row
        if (
          !/^\|[\s|:-]+\|$/.test(
            currentLine
          )
        ) {
          const cells =
            currentLine
              .split('|')
              .slice(1, -1)
              .map((cell) =>
                cell
                  .trim()
                  .replace(/\*\*/g, '')
                  .replace(/\*/g, '')
              )

          tableRows.push(cells)
        }

        i++
      }


      if (tableRows.length > 0) {
        const headers =
          tableRows[0]

        const bodyRows =
          tableRows.slice(1)

        elements.push(
          <div
            className="ai-table-wrapper"
            key={`table-${i}`}
          >
            <table className="ai-table">

              <thead>
                <tr>
                  {headers.map(
                    (
                      header,
                      index
                    ) => (
                      <th key={index}>
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody>
                {bodyRows.map(
                  (
                    row,
                    rowIndex
                  ) => (
                    <tr
                      key={rowIndex}
                    >

                      {row.map(
                        (
                          cell,
                          cellIndex
                        ) => {

                          const isStatus =
                            headers[
                              cellIndex
                            ]
                              ?.toLowerCase() ===
                            'status'

                          const statusText =
                            cell.toLowerCase()

                          let statusClass =
                            ''

                          if (
                            statusText.includes(
                              'out of stock'
                            )
                          ) {
                            statusClass =
                              'status-out'
                          }

                          else if (
                            statusText.includes(
                              'low stock'
                            )
                          ) {
                            statusClass =
                              'status-low'
                          }

                          else if (
                            statusText.includes(
                              'in stock'
                            )
                          ) {
                            statusClass =
                              'status-good'
                          }

                          return (
                            <td
                              key={
                                cellIndex
                              }
                            >
                              {isStatus &&
                              statusClass ? (
                                <span
                                  className={
                                    `ai-status-badge ${statusClass}`
                                  }
                                >
                                  {cell}
                                </span>
                              ) : (
                                cell
                              )}
                            </td>
                          )
                        }
                      )}

                    </tr>
                  )
                )}
              </tbody>

            </table>
          </div>
        )

        continue
      }
    }


    // ======================================
    // NORMAL TEXT
    // ======================================

    const cleanLine =
      line
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')

    elements.push(
      <p
        key={`text-${i}`}
        className="ai-response-line"
      >
        {cleanLine}
      </p>
    )

    i++
  }

  return <>{elements}</>
}


// ==========================================
// PROPS
// ==========================================

interface AIAgentPanelProps {
  inventory: InventoryItem[]

  onStockUpdated: (
    productName: string,
    newQuantity: number
  ) => void
}


// ==========================================
// AI AGENT PANEL
// ==========================================

function AIAgentPanel({
  inventory,
  onStockUpdated
}: AIAgentPanelProps) {

  const [question, setQuestion] =
    useState('')

  const [response, setResponse] =
    useState('')

  const [loading, setLoading] =
    useState(false)


  // ========================================
  // ASK AI AGENT
  // ========================================

  const askAI = async (
    event?: FormEvent
  ) => {

    event?.preventDefault()

    if (!question.trim()) {
      return
    }

    setLoading(true)

    setResponse('')


    try {

      const result =
        await fetch(
          '/api/agent',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({
              question,
              inventory
            })
          }
        )


      const data =
        await result.json()


      if (!result.ok) {
        throw new Error(
          data?.error ||
          'AI Agent request failed.'
        )
      }


      // ====================================
      // DISPLAY AI RESPONSE
      // ====================================

      setResponse(
        data.response ||
        'The AI agent completed the request.'
      )


      // ====================================
      // UPDATE REACT INVENTORY
      // ====================================

      /*
        The backend returns:

        tool:
          update_stock
          OR
          restock_product

        result:
          {
            success: true,
            product: "Mouse",
            newQuantity: 10
          }

        We use that result to update
        the React inventory state.
      */

      if (
        (
          data.tool ===
            'update_stock' ||
          data.tool ===
            'restock_product'
        ) &&
        data.result?.success === true &&
        data.result?.product &&
        typeof data.result?.newQuantity ===
          'number'
      ) {

        onStockUpdated(
          data.result.product,
          data.result.newQuantity
        )
      }

    }

    catch (error) {

      console.error(
        'AI Agent Error:',
        error
      )

      setResponse(
        error instanceof Error
          ? error.message
          : 'StockPulse AI Agent failed.'
      )

    }

    finally {
      setLoading(false)
    }
  }


  // ========================================
  // UI
  // ========================================

  return (

    <section className="ai-agent-section">

      {/* Header */}

      <div className="ai-agent-header">

        <div>

          <h2>
            🤖 StockPulse AI Agent
          </h2>

          <p>
            Ask the AI agent about your
            inventory or request stock
            updates.
          </p>

        </div>

        <div className="ai-agent-badge">
          🦜 LangChain Agent
        </div>

      </div>


      {/* Input */}

      <form
        className="ai-agent-form"
        onSubmit={askAI}
      >

        <input
          type="text"
          value={question}
          onChange={(event) =>
            setQuestion(
              event.target.value
            )
          }
          placeholder="Ask the AI agent something..."
          disabled={loading}
        />

        <button
          type="submit"
          disabled={
            loading ||
            !question.trim()
          }
        >
          {loading
            ? 'Thinking...'
            : 'Ask AI'}
        </button>

      </form>


      {/* Response */}

      {response && (

        <div className="ai-answer">

          <div className="ai-answer-title">
            🤖 AI Agent Response
          </div>

          <div className="answer-content">
            {formatAIResponse(response)}
          </div>

        </div>

      )}

    </section>
  )
}


export default AIAgentPanel