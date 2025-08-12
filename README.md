# GitHub User Activity (CLI) — Node 14

CLI que busca e mostra a **atividade recente** de um usuário do GitHub no terminal — **sem bibliotecas externas**, compatível com **Node.js 14+** (usa o módulo nativo `https`).

## Instalação local (link simbólico)
```bash
cd github-activity
npm install
npm link   # cria o comando global "github-activity"
```

> Alternativa: rodar direto com `node index.js <username>`

## Uso
```bash
github-activity <username> [--limit 30] [--json]
```

Exemplos:
```bash
github-activity torvalds
github-activity kamranahmedse --limit 15
github-activity gaearon --json
```

## Notas
- Sem autenticação: sujeito ao **rate limit** anônimo do GitHub. A CLI informa quando o limite reseta.
- `--json` imprime os eventos brutos (útil para depuração).

## Licença
MIT

## URL 
https://roadmap.sh/projects/github-user-activity