## ⚙️ What is MCP?

**Model Context Protocol (MCP)** is an open standard for integrating AI models with tools, data, and external systems in a consistent and structured way.  
It allows AI models to **interact with the environment**, **fetch data**, or **execute tasks** through well-defined interfaces.

---

## 🛠️ TOOL

### 🔹 Definition
A **Tool** let LLMs?MODELs take actions through your server.  
Tools can perform computation, fetch data and have side effects. Tools should be designed to be model-controlled - i.e., AI models will decide which tools to call, and the arguments.

### 🔹 Example
- Create a fake user  
- Fetch weather information  
- Send an email  

The model doesn’t do these directly — it **calls the tool** you’ve registered.

### 🔹 Purpose
Tools enable the AI model to:
- Perform actions (e.g., create a user, send an email, query a database).
- Extend the model’s functionality beyond text generation.
- Communicate with external systems securely.


## 🛠️ RESOURCES

### 🔹 Definition
**Resources** can also expose data to LLMs, but unlike tools shouldn't perform significant computation or have side effects.
A **Resource** is data that the AI model can read or access.

It could be:
- A file
- A database entry
- A user profile


## 🛠️ SAMPLING

### 🔹 Definition
**Sampling** means asking the **AI model to generate text or content**.
It’s called “sampling” because the model samples (chooses) words one by one from all possible options.
