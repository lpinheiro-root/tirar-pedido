# Natuhair Finanças no servidor interno (10.0.255.126)

| Processo PM2 | O quê | Quando |
|---|---|---|
| `natuhair-financas` | o site (`~/apps/natuhair-financas`, porta 3001) | sempre |
| `natuhair-ml-hora` | sincroniza compras do Mercado Livre (`ml-hora.mjs`) | a cada hora, :15 |
| `notas-alterdata` | robô de notas (Alterdata + e-mail) | a cada 30 min |

Acesso: http://10.0.255.126:3001 (rede da empresa).

## Atualizar o site depois de um commit
```
cd ~/apps/natuhair-financas && git pull && npm ci && npm run build && pm2 restart natuhair-financas
```

Configuração em `~/apps/natuhair-financas/.env.local` (chmod 600, não versionado).
"Conectar conta" do Mercado Livre precisa de HTTPS: continua pelo endereço da Netlify.
