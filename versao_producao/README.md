# 🏭 Fanuc FOCAS & CLP (PMC) - Versão de Produção

Versão configurada e otimizada para operação contínua 24/7 em ambiente fabril conectado diretamente a máquinas CNC Fanuc reais através das bibliotecas oficiais `Fwlib32.dll` (FOCAS 1/2) ou OPC UA.

---

## ⚙️ Configuração da Máquina Real

Edite o arquivo [`config.json`](./config.json) com o IP do seu CNC Fanuc:

```json
{
  "connection": {
    "driver": "focas_dll",
    "host": "192.168.1.100",
    "focasPort": 8193,
    "timeout": 5000,
    "autoReconnect": true,
    "reconnectInterval": 3000
  }
}
```

---

## 🚀 Como Executar em Produção

### Opção 1: Execução Direta (Início Rápido)
Dê um duplo clique no arquivo:
```text
start_service.bat
```

### Opção 2: Execução com PM2 (Recomendado para Fábrica 24/7)
Instale o PM2 globalmente e inicie o serviço:
```bash
npm install -g pm2
pm2 start pm2.config.js
pm2 save
pm2 startup
```

---

## 🌐 Acesso ao Dashboard Web
Abra qualquer navegador na rede:
```text
http://<IP-DO-COMPUTADOR>:3000
```
