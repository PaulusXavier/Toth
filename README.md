# Caderno de Campo · Paulo Xavier

Aplicativo web simples para registrar **visitas, pesquisas e atividades técnicas de campo**. Feito para uso pessoal, sem servidor: roda inteiramente no navegador e guarda os dados no próprio computador (via `localStorage`).

## Funcionalidades

- Cadastro de registros por tipo: **Visita**, **Pesquisa**, **Atividade técnica**
- Campos: data, local, código do caso/sujeito, resumo, observações detalhadas, tags e status
- Filtros por tipo e por "acompanhamento pendente"
- Busca por local, código, resumo, observações ou tags
- Exportação dos dados em **JSON** (backup completo) e **CSV** (planilha)
- Importação de um backup JSON
- Interface responsiva (funciona em celular/tablet em campo)

## Como usar localmente

Não precisa de instalação. Basta abrir o arquivo `index.html` em qualquer navegador:

```bash
# clonar o repositório
git clone https://github.com/SEU-USUARIO/caderno-de-campo-paulo-xavier.git
cd caderno-de-campo-paulo-xavier

# abrir no navegador (macOS)
open index.html
# ou no Linux
xdg-open index.html
# ou no Windows
start index.html
```

## Como publicar no GitHub

1. Crie um repositório novo no GitHub (pode ser privado, já que os registros são sobre pacientes/sujeitos de pesquisa):
   - Acesse https://github.com/new
   - Nome sugerido: `caderno-de-campo-paulo-xavier`
   - Marque como **Private** (recomendado, por confidencialidade)

2. No terminal, dentro desta pasta:

```bash
git init
git add .
git commit -m "Primeira versão do caderno de campo"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/caderno-de-campo-paulo-xavier.git
git push -u origin main
```

3. (Opcional) Publicar como site com **GitHub Pages** para acessar de qualquer lugar:
   - Vá em **Settings → Pages** no repositório
   - Em "Source", selecione a branch `main` e a pasta `/root`
   - Salve. O app ficará disponível em `https://SEU-USUARIO.github.io/caderno-de-campo-paulo-xavier/`
   - **Atenção:** se o repositório for público, qualquer pessoa poderá acessar o link (embora os dados fiquem salvos apenas no navegador de quem preenche o formulário, não em um servidor compartilhado). Para dados sensíveis, prefira repositório privado + GitHub Pages com controle de acesso, ou uso apenas local.

## Importante sobre privacidade e dados

- Os registros ficam salvos **apenas no navegador usado** (localStorage). Trocar de computador ou navegador não traz os dados automaticamente — use **Exportar JSON** para gerar backups e **Importar backup** para restaurá-los em outro dispositivo.
- Evite registrar nomes completos de pacientes/sujeitos: use códigos de caso (ex.: "Caso 014") no campo indicado, conforme boas práticas de sigilo profissional e o Código de Ética do Psicólogo / LGPD.
- Faça backups (Exportar JSON) periodicamente e guarde-os em local seguro — o navegador pode limpar dados locais em determinadas situações (ex.: limpeza de cache).

## Estrutura do projeto

```
caderno-de-campo-paulo-xavier/
├── index.html        # estrutura da página
├── css/
│   └── style.css      # estilos visuais
├── js/
│   └── app.js          # lógica do aplicativo (CRUD, filtros, exportação)
└── README.md
```

## Possíveis evoluções futuras

- Sincronização em nuvem (ex.: Firebase, Supabase) para acessar de vários dispositivos
- Autenticação por senha/PIN para abrir o app
- Anexos (fotos, documentos) por registro
- Relatórios em PDF por período ou por caso
