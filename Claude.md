# Claude.md - Projeto Titan AI - Documentação Técnica

## 📊 Visão Geral do Projeto (Atualizado: 30/01/2025)

### 🏗️ Arquitetura do Sistema
**Titan AI** é uma aplicação Flask de chat AI com interface web moderna, memória persistente e ferramentas integradas.

**Stack Tecnológico:**
- **Backend**: Python/Flask + SQLite
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **AI**: API externa via utils/ai_client.py
- **Segurança**: CSRF, Talisman, Rate Limiting
- **Streaming**: Server-Sent Events (SSE)

---

## 🚀 Funcionalidades Principais

### ✅ Chat em Tempo Real
- **Streaming de mensagens** via SSE (`/stream` endpoint)
- **Modo pensamento prolongado** com exibição em tempo real
- **Regeneração de respostas** com botões de ação
- **Sistema de feedback** integrado com classificação

### ✅ Interface Moderna
- **Design responsivo** com gradientes e animações
- **Partículas animadas** de fundo
- **Dropdowns de configuração** inline
- **Modais informativos** (Titan Info, Feedback)

### ✅ Barra de Pensamento (RECÉM-IMPLEMENTADA) ✨
- **Largura fixa de 400px** - não cresce com conteúdo
- **Template HTML**: `thinking-bar-template`
- **Classes CSS**: `.thinking-bar`, `.thinking-bar-header`, `.thinking-bar-content`
- **Comportamento**: Sempre fechada, clicável para expandir
- **Texto padrão**: "🧠 Pensando..."

---

## 📁 Estrutura de Arquivos

### Backend (Python)
```
├── app.py                 # App principal Flask
├── config.py             # Configurações
├── routes/main_routes.py # Endpoints (/chat, /stream, /feedback)
├── models/               # Gerenciadores (database, session, feedback)
├── middleware/           # Session middleware
├── tools/                # Memory, system tools, web search
└── utils/ai_client.py   # Cliente da API de IA
```

### Frontend (Web)
```
├── templates/index.html      # Página principal
├── static/script.js         # JavaScript principal (~1000 linhas)
├── static/styles.css        # CSS (~2000 linhas)
└── static/feedback-inline.js # Sistema de feedback
```

---

## 🧠 Sistema de Pensamento - Implementação Técnica

### Template HTML (templates/index.html:356-368)
```html
<template id="thinking-bar-template">
    <div class="thinking-bar" onclick="toggleThinkingBar(this)">
        <div class="thinking-bar-header">
            <span class="thinking-bar-text">🧠 Pensando...</span>
            <svg class="thinking-bar-icon">...</svg>
        </div>
        <div class="thinking-bar-content">
            <div class="thinking-bar-scroll"></div>
        </div>
    </div>
</template>
```

### CSS (styles.css:388-463)
```css
.thinking-bar {
    width: 400px !important;           /* Largura fixa */
    min-width: 400px !important;
    max-width: 400px !important;
    background: rgba(26, 26, 26, 0.8);
    border-radius: 8px;
    /* ... */
}
.thinking-bar-content {
    max-height: 0;                     /* Inicialmente fechada */
    transition: max-height 0.3s ease;
}
.thinking-bar.expanded .thinking-bar-content {
    max-height: 300px;                 /* Expandida */
}
```

### JavaScript (script.js:384-422)
```javascript
function createThinkingContainerLive(messageContainer) {
    // Clona template e insere na mensagem
    const template = document.getElementById('thinking-bar-template');
    const thinkingClone = template.content.cloneNode(true);
    // Sem interferência de largura via JS
    assistantDiv.insertAdjacentElement('afterbegin', thinkingContainer);
}

function toggleThinkingBar(bar) {
    // Toggle classe 'expanded' para mostrar/ocultar conteúdo
    bar.classList.toggle('expanded');
}

function updateThinkingContent(thinkingContainer, content) {
    // Atualiza conteúdo em tempo real durante streaming
    const scroll = thinkingContainer.querySelector('.thinking-bar-scroll');
    scroll.textContent = content;
}
```

---

## 🔄 Fluxo de Chat com Pensamento

1. **Usuário envia mensagem** → `sendChatMessage()`
2. **Requisição POST /chat** com modo pensamento ativo
3. **Servidor responde via SSE** → `/stream` endpoint
4. **JavaScript processa chunks**:
   - `thinking_content` → Atualiza barra de pensamento
   - `content` → Atualiza resposta principal
5. **Barra criada dinamicamente** via `createThinkingContainerLive()`
6. **Usuário pode clicar** para expandir/recolher durante geração

---

## 🎯 Limpeza de Código Realizada

### ❌ Funcionalidades Removidas (Sessão Anterior)
- **Sistema de pagamento/Stripe** (~200 linhas JS)
- **Controles de limite de uso anônimo** (~150 linhas JS) 
- **Modais premium/upgrade** (~100 linhas JS)
- **Sistema de criação de conta** (~50 linhas JS)
- **Sidebar Claude complexa** (~150 linhas JS + 320 linhas CSS)
- **Verificação de planos** (~100 linhas JS)

### ✅ Funcionalidades Mantidas
- **Chat streaming core**
- **Sistema de feedback**
- **Regeneração de mensagens**
- **Modo pensamento prolongado**
- **Configurações dropdown**

---

## 🐛 Problemas Resolvidos

### ✅ Container de Pensamento (29-30/01/2025)
**Problema**: Estilos conflitantes, crescimento lateral descontrolado
**Solução**: Redesign completo com largura fixa de 400px

**Antes**: CSS complexo (155 linhas) + JavaScript interferindo
**Depois**: CSS limpo (40 linhas) + JavaScript simplificado

**Lição Aprendida**: JavaScript inline `style` sobrescreve CSS - removido

---

## 📝 Configurações e Ambiente

### Desenvolvimento
- **DEBUG=True** → CSRF desabilitado, HTTP permitido
- **HOST=localhost:5000**
- **Banco**: SQLite local (titan_memory.db)

### Segurança
- **CSRF Protection** (produção)
- **Rate Limiting** via Flask-Limiter
- **Talisman** para headers de segurança
- **Session management** seguro

---

## 🔍 Arquivos Principais para Manutenção

### 1. Lógica de Chat
- `routes/main_routes.py` - Endpoints principais
- `static/script.js` - Frontend chat logic
- `utils/ai_client.py` - Comunicação com IA

### 2. Interface
- `templates/index.html` - Estrutura HTML
- `static/styles.css` - Estilos visuais
- `static/feedback-inline.js` - Sistema feedback

### 3. Dados
- `models/database.py` - Schema banco
- `models/feedback_manager.py` - Gestão feedbacks
- `data/feedbacks/` - Armazenamento JSON

---

## 🎮 Funcionalidades em Teste
- **Memória Persistente** (Beta)
- **Busca na Internet** (Beta)  
- **Modo Raciocínio** (Ativo)
- **Chat Streaming** (Ativo)

---

*Última atualização: 30/01/2025 - Barra de pensamento com largura fixa implementada* ✅