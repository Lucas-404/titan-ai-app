# Titan AI System Summary

## Project Overview

**Project Name:** Titan AI

**Description:** A Flask-based web application that provides a chat interface with an AI assistant. The application is designed with a focus on security and session isolation, using a local Ollama instance for AI model inference. It supports features like chat history, a "thinking mode" for the AI, and a set of tools the AI can use to perform actions.

## Core Technologies

*   **Backend:** Python, Flask
*   **AI Model:** Ollama (specifically the "saturno" model)
*   **Frontend:** HTML, CSS, JavaScript
*   **Database:** SQLite (for memory tools)

## Key Features

*   **Real-time Chat:** A web interface for real-time, streaming conversations with the AI.
*   **Session Management:** Each user session is isolated, with its own chat history and context.
*   **Chat History:** Conversations are saved per-session in JSON files, with automatic backups.
*   **AI "Thinking Mode":** A feature that allows the user to see the AI's reasoning process before it gives a final answer. This is controlled by the `/think` and `/no_think` commands.
*   **Extensible AI Tools:** The AI has access to a set of tools to interact with its environment and retrieve information. These tools include:
    *   `salvar_dados`: Saves key-value data to a persistent database, scoped to the user's session.
    *   `buscar_dados`: Retrieves previously saved data.
    *   `deletar_dados`: Deletes saved data.
    *   `listar_categorias`: Lists all categories of saved data.
    *   `obter_data_hora`: Gets the current system date and time.
    *   `search_web_comprehensive`: (Mentioned in prompts, likely a web search tool).

## Project Structure

The project is organized into the following main directories:

*   `app.py`: The main entry point for the Flask application. It initializes the app, security features (CSRF, Talisman, Rate Limiting), and registers blueprints.
*   `config.py`: Contains all the main configuration variables for the application, including paths, AI model settings, and security flags.
*   `/routes`: Contains Flask Blueprints that define the application's routes. `main_routes.py` handles the core chat and session logic.
*   `/models`: Includes the data management logic. Key files are:
    *   `chat_manager.py`: Manages loading, saving, and backing up chat histories.
    *   `session_manager.py`: Handles user session creation and tracking.
    *   `database.py`: Manages the SQLite database for the memory tools.
    *   `tools_manager.py`: Manages the execution of AI tools.
*   `/tools`: Defines the tools available to the AI. Each file typically contains a set of related functions (e.g., `memory_tools.py`, `system_tools.py`).
*   `/utils`: Contains utility modules, most importantly `ai_client.py`, which handles all communication with the Ollama API.
*   `/static`: Contains the frontend static assets (JavaScript, CSS).
*   `/templates`: Contains the HTML templates for the web interface.
*   `/chats`: The root directory for storing all session-related data, including chat histories and backups.

## How to Run

1.  **Prerequisites:**
    *   Python 3.10+
    *   An instance of Ollama running with the `saturno` model available.
2.  **Installation:**
    *   Install Python dependencies from `requirements.txt` (if available).
3.  **Execution:**
    *   Run the main application file: `python app.py`
    *   The application will be accessible at `http://0.0.0.0:5001` by default.
