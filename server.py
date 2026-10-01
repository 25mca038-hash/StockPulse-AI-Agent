import os
import sys
import io
import re
import json
import copy
from typing import Any, Dict, List, Optional

# Ensure UTF-8 output encoding for Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

# LangChain Framework Imports
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

app = Flask(__name__, static_folder="dist", static_url_path="")

CORS(app, origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173"
])

PORT = int(os.getenv("PORT", 3000))
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "openai/gpt-oss-20b")

if not NVIDIA_API_KEY:
    print("WARNING: NVIDIA_API_KEY is not set in environment or .env file.")


# ==========================================
# LANGCHAIN LLM FACTORY
# ==========================================

def get_langchain_llm(temperature: float = 0.0, max_tokens: int = 1024) -> ChatOpenAI:
    """Instantiate a LangChain ChatOpenAI client targeting the NVIDIA NIM API."""
    return ChatOpenAI(
        model=NVIDIA_MODEL,
        api_key=NVIDIA_API_KEY,
        base_url=NVIDIA_BASE_URL,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=30,
        max_retries=2
    )


# ==========================================
# INVENTORY DOMAIN LOGIC
# ==========================================

def find_product(inventory: List[Dict[str, Any]], product_name: str) -> Optional[Dict[str, Any]]:
    """Find a product in inventory using exact, substring, or token matching."""
    if not product_name:
        return None

    p_clean = product_name.strip().lower()

    # 1. Exact match
    for item in inventory:
        if item.get("name", "").strip().lower() == p_clean:
            return item

    # 2. Substring match
    for item in inventory:
        item_lower = item.get("name", "").strip().lower()
        if p_clean in item_lower or item_lower in p_clean:
            return item

    # 3. Token match
    tokens = set(re.findall(r"\w+", p_clean))
    for item in inventory:
        item_tokens = set(re.findall(r"\w+", item.get("name", "").lower()))
        if tokens & item_tokens:
            return item

    return None


def check_inventory(inventory: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Inspect all items in inventory and compute stock status."""
    result = []
    for item in inventory:
        qty = item.get("quantity", 0)
        min_stock = item.get("minimumStock", 0)
        status = "Out of Stock" if qty == 0 \
            else "Low Stock" if qty < min_stock \
            else "In Stock"

        result.append({
            "id": item.get("id"),
            "name": item.get("name"),
            "category": item.get("category"),
            "quantity": qty,
            "minimumStock": min_stock,
            "price": item.get("price"),
            "supplier": item.get("supplier"),
            "status": status
        })
    return result


def update_stock(inventory: List[Dict[str, Any]], product_name: str, quantity_to_add: int) -> Dict[str, Any]:
    """Adjust stock quantity for a product with validation against negative stock."""
    product = find_product(inventory, product_name)

    if not product:
        return {
            "success": False,
            "message": f'Product "{product_name}" was not found.'
        }

    old_quantity = product.get("quantity", 0)
    new_quantity = old_quantity + quantity_to_add

    # Prevent negative stock
    if new_quantity < 0:
        return {
            "success": False,
            "message": (
                f"Cannot remove {abs(quantity_to_add)} units from {product['name']}. "
                f"Only {old_quantity} units are currently available."
            )
        }

    product["quantity"] = new_quantity
    min_stock = product.get("minimumStock", 0)

    status = "Out of Stock" if new_quantity == 0 \
        else "Low Stock" if new_quantity < min_stock \
        else "In Stock"

    return {
        "success": True,
        "product": product["name"],
        "oldQuantity": old_quantity,
        "quantityAdded": quantity_to_add,
        "newQuantity": new_quantity,
        "minimumStock": min_stock,
        "status": status
    }


def low_stock_alert(inventory: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Identify products where quantity is below minimum required stock."""
    low_stock_products = []
    for item in inventory:
        qty = item.get("quantity", 0)
        min_stock = item.get("minimumStock", 0)
        if qty < min_stock:
            status = "Out of Stock" if qty == 0 else "Low Stock"
            low_stock_products.append({
                "id": item.get("id"),
                "name": item.get("name"),
                "category": item.get("category"),
                "quantity": qty,
                "minimumStock": min_stock,
                "shortage": max(min_stock - qty, 0),
                "supplier": item.get("supplier"),
                "status": status
            })

    return {
        "totalAlerts": len(low_stock_products),
        "products": low_stock_products
    }


def restock_product(inventory: List[Dict[str, Any]], product_name: str) -> Dict[str, Any]:
    """Automatically restock a product up to its minimum required stock level."""
    product = find_product(inventory, product_name)

    if not product:
        return {
            "success": False,
            "message": f'Product "{product_name}" was not found.'
        }

    old_quantity = product.get("quantity", 0)
    min_stock = product.get("minimumStock", 0)

    # Already has sufficient stock
    if old_quantity >= min_stock:
        return {
            "success": False,
            "alreadySufficient": True,
            "product": product["name"],
            "oldQuantity": old_quantity,
            "newQuantity": old_quantity,
            "minimumStock": min_stock,
            "message": (
                f"{product['name']} already has sufficient stock. "
                f"Current quantity is {old_quantity}, minimum stock is {min_stock}."
            )
        }

    quantity_needed = min_stock - old_quantity
    product["quantity"] = min_stock

    status = "In Stock" if product["quantity"] >= min_stock else "Low Stock"

    return {
        "success": True,
        "product": product["name"],
        "oldQuantity": old_quantity,
        "quantityAdded": quantity_needed,
        "newQuantity": product["quantity"],
        "minimumStock": min_stock,
        "supplier": product.get("supplier"),
        "status": status
    }


# ==========================================
# LANGCHAIN TOOL DEFINITIONS
# ==========================================

@tool
def tool_check_inventory() -> str:
    """Inspect all items in inventory, check current stock levels, quantities, prices, and stock statuses."""
    return "check_inventory"


@tool
def tool_update_stock(product_name: str, quantity: int) -> str:
    """Update the stock quantity of a product. Use a positive number to add stock, or a negative number to remove stock."""
    return f"update_stock:{product_name}:{quantity}"


@tool
def tool_low_stock_alert() -> str:
    """Check for products that are low in stock (quantity below minimum stock) or completely out of stock."""
    return "low_stock_alert"


@tool
def tool_restock_product(product_name: str) -> str:
    """Automatically restock, replenish, or refill a specific product back to its required minimum stock level."""
    return f"restock_product:{product_name}"


langchain_agent_tools = [
    tool_check_inventory,
    tool_update_stock,
    tool_low_stock_alert,
    tool_restock_product
]


# ==========================================
# PARSERS & LOCAL HEURISTICS
# ==========================================

def parse_planner_response(planner_response: str) -> Optional[Dict[str, Any]]:
    """Clean markdown fences and extract JSON object."""
    cleaned = planner_response.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(cleaned[start:end + 1])
        except (json.JSONDecodeError, ValueError):
            pass

    return None


def detect_product_name_from_text(text: str, inventory: List[Dict[str, Any]]) -> str:
    """Detect product name mentioned in the query."""
    text_lower = text.lower()
    for item in inventory:
        if item.get("name", "").lower() in text_lower:
            return item["name"]

    # Common fallbacks
    for name in ["Laptop", "Keyboard", "Mouse", "Monitor", "USB Cable"]:
        if name.lower() in text_lower:
            return name
    return ""


def local_fallback_decision(question: str, inventory: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Deterministic local fallback router when AI model is unreachable."""
    lower_q = question.lower()
    product_name = detect_product_name_from_text(question, inventory)

    # Restock specific product
    if any(kw in lower_q for kw in ["restock", "replenish", "refill"]):
        if product_name:
            return {
                "tool": "restock_product",
                "productName": product_name,
                "reason": f"User requested restocking of {product_name}."
            }
        return {
            "tool": "low_stock_alert",
            "reason": "User requested restocking information."
        }

    # Add or remove stock
    if any(kw in lower_q for kw in ["add", "remove", "increase", "decrease"]):
        number_match = re.search(r"\d+", lower_q)
        number = int(number_match.group(0)) if number_match else 0
        if "remove" in lower_q or "decrease" in lower_q:
            quantity = -number
        else:
            quantity = number

        if product_name and number != 0:
            return {
                "tool": "update_stock",
                "productName": product_name,
                "quantity": quantity,
                "reason": f"User requested stock change of {quantity} units for {product_name}."
            }

    # Low stock queries
    if any(kw in lower_q for kw in [
        "low stock", "need restock", "need restocking", "running low", "reorder", "shortage"
    ]):
        return {
            "tool": "low_stock_alert",
            "reason": "User wants products that need restocking or are low in stock."
        }

    # Default to check inventory
    return {
        "tool": "check_inventory",
        "reason": "User requested inventory overview."
    }


# ==========================================
# LANGCHAIN AGENT ACTION SELECTION
# ==========================================

def select_agent_action_with_langchain(question: str, inventory: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Select the appropriate agent tool using LangChain Tool Calling and Prompting."""
    if not NVIDIA_API_KEY:
        print("LangChain: No NVIDIA_API_KEY provided; using local router.")
        return local_fallback_decision(question, inventory)

    # 1. Primary: LangChain Tool Calling via ChatOpenAI
    try:
        llm = get_langchain_llm(temperature=0.0, max_tokens=300)
        llm_with_tools = llm.bind_tools(langchain_agent_tools)

        system_msg = SystemMessage(
            content=(
                "You are StockPulse AI Agent's core decision brain. "
                "Evaluate the user's request and invoke exactly ONE inventory tool: "
                "- 'tool_check_inventory' for general stock checking, overview, or viewing available items. "
                "- 'tool_update_stock' when adding or removing a specific number of units from an item. "
                "- 'tool_low_stock_alert' when asking which products need restocking, are running low, or out of stock. "
                "- 'tool_restock_product' when asking to restock, replenish, or refill a specific product."
            )
        )

        ai_msg = llm_with_tools.invoke([
            system_msg,
            HumanMessage(content=question)
        ])

        if ai_msg.tool_calls and len(ai_msg.tool_calls) > 0:
            call = ai_msg.tool_calls[0]
            raw_name = call.get("name", "")
            # Normalize tool name (strip tool_ prefix if present)
            clean_tool = raw_name.replace("tool_", "")
            args = call.get("args", {})
            product_name = args.get("product_name") or args.get("productName") or ""
            quantity = args.get("quantity")

            # If tool needs product name and wasn't extracted, attempt extraction
            if clean_tool in ["update_stock", "restock_product"] and not product_name:
                product_name = detect_product_name_from_text(question, inventory)

            print(f"LangChain Tool Calling selected: {clean_tool} with args: {args}")
            return {
                "tool": clean_tool,
                "productName": product_name,
                "quantity": quantity,
                "reason": f"Selected tool '{clean_tool}' using LangChain Tool Calling."
            }

    except Exception as error:
        print(f"LangChain Tool Calling attempt error: {error}")

    # 2. Secondary: LangChain Structured Prompt Chain
    try:
        router_prompt = ChatPromptTemplate.from_messages([
            ("system", """
You are the decision-making brain of StockPulse AI.
Analyze the user's request and choose exactly ONE inventory tool:
- "check_inventory" (general inventory check, viewing products)
- "update_stock" (add or remove a specific count of units)
- "low_stock_alert" (which products need restocking, low stock items)
- "restock_product" (restock or refill a specific product)

Output ONLY valid JSON:
{{
  "tool": "check_inventory" | "update_stock" | "low_stock_alert" | "restock_product",
  "productName": "exact product name or empty",
  "quantity": number or 0,
  "reason": "short explanation"
}}
"""),
            ("human", "{question}")
        ])

        llm = get_langchain_llm(temperature=0.0, max_tokens=300)
        chain = router_prompt | llm | StrOutputParser()
        raw_res = chain.invoke({"question": question})

        parsed = parse_planner_response(raw_res)
        if parsed and parsed.get("tool"):
            if not parsed.get("productName"):
                parsed["productName"] = detect_product_name_from_text(question, inventory)
            print(f"LangChain Prompt Chain selected: {parsed.get('tool')}")
            return parsed

    except Exception as error:
        print(f"LangChain Prompt Chain attempt error: {error}")

    # 3. Fallback: Local Keyword Heuristic
    print("Using local keyword fallback router.")
    return local_fallback_decision(question, inventory)


# ==========================================
# LANGCHAIN EXPLANATION GENERATORS
# ==========================================

def generate_check_inventory_explanation(question: str, inventory_result: List[Dict[str, Any]]) -> str:
    """Generate Markdown explanation for check_inventory using LangChain."""
    try:
        prompt = ChatPromptTemplate.from_messages([
            ("system", """
You are StockPulse AI.
You have executed the check_inventory tool.
Analyze the inventory data and answer the user's question.

Rules:
- Clearly identify low-stock and out-of-stock items.
- Be concise, direct, and professional.
- Use a Markdown table for inventory summary when helpful.
- Do not invent information.
"""),
            ("human", "User Question: {question}\n\nTool Result:\n{result}")
        ])
        chain = prompt | get_langchain_llm(temperature=0.2, max_tokens=1024) | StrOutputParser()
        return chain.invoke({
            "question": question,
            "result": json.dumps(inventory_result, indent=2)
        })
    except Exception as e:
        print(f"LangChain explanation error (check_inventory): {e}")
        return "Here is the current status of your inventory. All items and stock levels have been analyzed."


def generate_update_stock_explanation(question: str, update_result: Dict[str, Any]) -> str:
    """Generate explanation for update_stock using LangChain."""
    try:
        prompt = ChatPromptTemplate.from_messages([
            ("system", """
You are StockPulse AI.
The update_stock tool has been executed.

Explain clearly:
- Product name
- Previous quantity
- Quantity added or removed
- New quantity
- Current status (In Stock, Low Stock, or Out of Stock)

Be concise and direct. Do not invent information.
"""),
            ("human", "User Question: {question}\n\nTool Result:\n{result}")
        ])
        chain = prompt | get_langchain_llm(temperature=0.2, max_tokens=500) | StrOutputParser()
        return chain.invoke({
            "question": question,
            "result": json.dumps(update_result, indent=2)
        })
    except Exception as e:
        print(f"LangChain explanation error (update_stock): {e}")
        return (
            f"Stock updated successfully for {update_result.get('product')}. "
            f"Quantity changed from {update_result.get('oldQuantity')} to {update_result.get('newQuantity')}."
        )


def generate_low_stock_explanation(question: str, alert_result: Dict[str, Any]) -> str:
    """Generate explanation for low_stock_alert using LangChain."""
    try:
        prompt = ChatPromptTemplate.from_messages([
            ("system", """
You are StockPulse AI.
The low_stock_alert tool has been executed.

Explain which products need restocking.
Include:
- Product name
- Current quantity
- Minimum required stock
- Units needed (shortage)
- Supplier

Use a Markdown table when multiple products need attention.
If there are no alerts, state that all products currently have sufficient stock.
Be concise.
"""),
            ("human", "User Question: {question}\n\nTool Result:\n{result}")
        ])
        chain = prompt | get_langchain_llm(temperature=0.2, max_tokens=800) | StrOutputParser()
        return chain.invoke({
            "question": question,
            "result": json.dumps(alert_result, indent=2)
        })
    except Exception as e:
        print(f"LangChain explanation error (low_stock_alert): {e}")
        total = alert_result.get("totalAlerts", 0)
        return f"Low stock check completed. {total} product(s) require attention or restocking."


def generate_restock_explanation(question: str, restock_result: Dict[str, Any]) -> str:
    """Generate explanation for restock_product using LangChain."""
    try:
        prompt = ChatPromptTemplate.from_messages([
            ("system", """
You are StockPulse AI.
The restock_product tool has been executed.

Explain the automatic restocking result:
- Product name
- Previous quantity
- Quantity added
- New quantity
- Minimum required stock
- Supplier
- Current status

Be concise and easy to understand.
"""),
            ("human", "User Question: {question}\n\nTool Result:\n{result}")
        ])
        chain = prompt | get_langchain_llm(temperature=0.2, max_tokens=500) | StrOutputParser()
        return chain.invoke({
            "question": question,
            "result": json.dumps(restock_result, indent=2)
        })
    except Exception as e:
        print(f"LangChain explanation error (restock_product): {e}")
        return (
            f"Restocked {restock_result.get('product')}. Added {restock_result.get('quantityAdded')} units. "
            f"Current quantity is {restock_result.get('newQuantity')}."
        )


# ==========================================
# MAIN AI AGENT ENDPOINT (/api/agent)
# ==========================================

@app.route("/api/agent", methods=["POST"])
def agent_endpoint():
    try:
        body = request.get_json()

        if not body:
            return jsonify({"error": "Request body is required."}), 400

        question = body.get("question")
        inventory = body.get("inventory")

        if not question or not isinstance(inventory, list):
            return jsonify({"error": "Question and inventory are required."}), 400

        # Deep copy inventory to keep operations pure
        inventory = copy.deepcopy(inventory)

        # -------------------------------------
        # STEP 1: LANGCHAIN AGENT DECISION
        # -------------------------------------
        decision = select_agent_action_with_langchain(question, inventory)
        tool_name = decision.get("tool", "check_inventory")
        print(f"StockPulse AI Agent Decision: {decision}")

        # -------------------------------------
        # TOOL 1: CHECK INVENTORY
        # -------------------------------------
        if tool_name == "check_inventory":
            inventory_result = check_inventory(inventory)
            ai_response = generate_check_inventory_explanation(question, inventory_result)

            return jsonify({
                "response": ai_response,
                "agent": "StockPulse AI LangChain Agent",
                "tool": "check_inventory",
                "reason": decision.get("reason"),
                "result": inventory_result
            })

        # -------------------------------------
        # TOOL 2: UPDATE STOCK
        # -------------------------------------
        if tool_name == "update_stock":
            product_name = decision.get("productName")
            raw_qty = decision.get("quantity")

            if not product_name:
                product_name = detect_product_name_from_text(question, inventory)

            if not product_name:
                return jsonify({
                    "response": "Please specify the product name you would like to update.",
                    "agent": "StockPulse AI LangChain Agent",
                    "tool": "update_stock",
                    "reason": decision.get("reason"),
                    "result": {"success": False, "message": "Product name is required."}
                })

            try:
                quantity = int(raw_qty) if raw_qty is not None else 0
            except (TypeError, ValueError):
                quantity = 0

            # If quantity wasn't in decision args, look for number in question
            if quantity == 0:
                num_match = re.search(r"\d+", question)
                if num_match:
                    num = int(num_match.group(0))
                    if any(w in question.lower() for w in ["remove", "decrease", "subtract"]):
                        quantity = -num
                    else:
                        quantity = num

            if quantity == 0:
                return jsonify({
                    "response": f"Please specify how many units to add or remove for {product_name}.",
                    "agent": "StockPulse AI LangChain Agent",
                    "tool": "update_stock",
                    "reason": decision.get("reason"),
                    "result": {"success": False, "message": "Quantity cannot be zero."}
                })

            update_result = update_stock(inventory, product_name, quantity)

            if not update_result.get("success"):
                return jsonify({
                    "response": update_result.get("message"),
                    "agent": "StockPulse AI LangChain Agent",
                    "tool": "update_stock",
                    "reason": decision.get("reason"),
                    "result": update_result
                })

            ai_response = generate_update_stock_explanation(question, update_result)

            return jsonify({
                "response": ai_response,
                "agent": "StockPulse AI LangChain Agent",
                "tool": "update_stock",
                "reason": decision.get("reason"),
                "result": update_result
            })

        # -------------------------------------
        # TOOL 3: LOW STOCK ALERT
        # -------------------------------------
        if tool_name == "low_stock_alert":
            alert_result = low_stock_alert(inventory)
            ai_response = generate_low_stock_explanation(question, alert_result)

            return jsonify({
                "response": ai_response,
                "agent": "StockPulse AI LangChain Agent",
                "tool": "low_stock_alert",
                "reason": decision.get("reason"),
                "result": alert_result
            })

        # -------------------------------------
        # TOOL 4: AUTOMATIC RESTOCK
        # -------------------------------------
        if tool_name == "restock_product":
            product_name = decision.get("productName")
            if not product_name:
                product_name = detect_product_name_from_text(question, inventory)

            if not product_name:
                return jsonify({
                    "response": "Please specify which product you would like to restock.",
                    "agent": "StockPulse AI LangChain Agent",
                    "tool": "restock_product",
                    "reason": decision.get("reason"),
                    "result": {"success": False, "message": "Product name is required."}
                })

            restock_result = restock_product(inventory, product_name)

            if not restock_result.get("success"):
                return jsonify({
                    "response": restock_result.get("message"),
                    "agent": "StockPulse AI LangChain Agent",
                    "tool": "restock_product",
                    "reason": decision.get("reason"),
                    "result": restock_result
                })

            ai_response = generate_restock_explanation(question, restock_result)

            return jsonify({
                "response": ai_response,
                "agent": "StockPulse AI LangChain Agent",
                "tool": "restock_product",
                "reason": decision.get("reason"),
                "result": restock_result
            })

        # -------------------------------------
        # DEFAULT / UNKNOWN TOOL FALLBACK
        # -------------------------------------
        inventory_result = check_inventory(inventory)
        ai_response = generate_check_inventory_explanation(question, inventory_result)

        return jsonify({
            "response": ai_response,
            "agent": "StockPulse AI LangChain Agent",
            "tool": "check_inventory",
            "reason": decision.get("reason", "Handled inventory check"),
            "result": inventory_result
        })

    except Exception as error:
        print(f"Agent Endpoint Error: {error}")
        return jsonify({"error": f"StockPulse AI Agent error: {str(error)}"}), 500


# ==========================================
# HEALTH CHECK
# ==========================================

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "StockPulse AI server is running",
        "framework": "LangChain",
        "model": NVIDIA_MODEL
    })


# ==========================================
# STANDARD AI ENDPOINT (/api/ai)
# ==========================================

@app.route("/api/ai", methods=["POST"])
def ai_endpoint():
    try:
        body = request.get_json()

        if not body:
            return jsonify({"error": "Request body is required."}), 400

        question = body.get("question")
        inventory = body.get("inventory")

        if not question or not isinstance(inventory, list):
            return jsonify({"error": "Question and inventory are required."}), 400

        inventory_text = "\n\n".join(
            f"Product: {item.get('name')}\n"
            f"Category: {item.get('category')}\n"
            f"Quantity: {item.get('quantity')}\n"
            f"Price: ₹{item.get('price')}\n"
            f"Minimum Stock: {item.get('minimumStock')}\n"
            f"Supplier: {item.get('supplier')}"
            for item in inventory
        )

        prompt = ChatPromptTemplate.from_messages([
            ("system", """
You are StockPulse AI, an intelligent inventory management assistant.

Analyze the inventory data provided by the user and answer questions about it.

Rules:
- Use only the inventory information provided.
- Be concise, accurate, and easy to understand.
- Mention product names, quantities, and minimum stocks when relevant.
- If quantity is below minimum stock, identify it as low stock.
- If quantity is 0, identify it as out of stock.
- Provide practical inventory management insights.
"""),
            ("human", "Inventory:\n\n{inventory}\n\nUser Question:\n{question}")
        ])

        chain = prompt | get_langchain_llm(temperature=0.2, max_tokens=1024) | StrOutputParser()
        ai_response = chain.invoke({
            "inventory": inventory_text,
            "question": question
        })

        return jsonify({"response": ai_response})

    except Exception as error:
        print(f"AI Endpoint Error: {error}")
        return jsonify({"error": f"Failed to generate AI response: {str(error)}"}), 500


# ==========================================
# SERVE FRONTEND (Production build)
# ==========================================

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


# ==========================================
# START SERVER
# ==========================================

if __name__ == "__main__":
    print(f"StockPulse AI LangChain server running at http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
