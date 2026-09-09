# Nest Template API

Base reutilizável em NestJS 11, com autenticação no estilo do Sellow: JWT access/refresh, bcrypt, Prisma 7, SQLite local e Turso em produção. A organização aproveita ideias do nestjs-boilerplate, com configuração tipada, DTOs e utilitários compartilhados.

## Começar

Use Node.js 24 LTS e pnpm 10 (a versão do pnpm está fixada em `packageManager`). Execute na raiz do projeto:

```sh
pnpm install
pnpm setup:env
pnpm prisma:migrate:deploy
pnpm start:dev
```

`setup:env` cria `.env` com dois segredos aleatórios diferentes e preserva um arquivo já existente. O client Prisma é gerado no `postinstall` e antes do build. O banco começa vazio, sem usuários ou senhas padrão.

- API: http://localhost:3000/api
- Swagger: http://localhost:3000/docs
- OpenAPI JSON: http://localhost:3000/docs-json
- Liveness: http://localhost:3000/health
- Readiness do banco: http://localhost:3000/health/ready

## Estrutura

```text
src/
  common/
    decorators/      # @Public, @CurrentUser e @Roles
    dto/             # paginação validada
    filters/         # erros HTTP padronizados
    guards/          # autenticação e autorização globais
    transformers/    # normalização de email
    types/           # contexto da requisição e payload JWT
    utils/           # Bearer token, paginação e opções de validação
  config/            # configuração tipada e validada na inicialização
  modules/
    auth/            # cadastro, login, refresh, logout e perfil
    health/          # liveness e readiness
    prisma/          # conexão e ciclo de vida do Prisma
    users/           # persistência e consultas administrativas
  prisma/            # schema e migrations versionadas
  generated/prisma/  # gerado automaticamente; não editar/versionar
  setup-app.ts       # configuração HTTP usada pela aplicação e pelos testes
  main.ts            # bootstrap
scripts/             # setup e execução compatíveis com Windows/Linux
```

Crie funcionalidades em `src/modules/<nome>`, com controller, service, module e DTOs locais. Importe o módulo no `AppModule`. Coloque em `common` somente o que for efetivamente compartilhado. Injete `PrismaService` importando `PrismaModule`; mantenha regras de negócio nos services. O template não impõe repositories genéricos ou camadas extras sobre o Prisma.

Todas as rotas novas são protegidas automaticamente. Use `@Public()` para liberar uma rota e `@Roles(Role.ADMIN)` para exigir o papel administrativo. `@CurrentUser('sub')` fornece o ID autenticado. Os guards consultam o usuário no banco, aplicando imediatamente desativação, exclusão e mudança de papel.

## Autenticação

O prefixo padrão é `/api`:

- `POST /api/auth/register`: `{ "email": "user@example.com", "password": "uma-senha-segura", "name": "Nome" }`; responde 201 com `accessToken`, `refreshToken` e `user`.
- `POST /api/auth/login`: `{ "email": "user@example.com", "password": "uma-senha-segura" }`; responde 200 no mesmo formato.
- `POST /api/auth/refresh`: envie o **refresh token** em `Authorization: Bearer <refreshToken>`; responde com dois tokens novos.
- `GET /api/auth/me`: envie o **access token** em `Authorization: Bearer <accessToken>`; retorna o perfil.
- `POST /api/auth/logout`: usa access token; responde 204 e revoga a renovação da sessão.
- `GET /api/users?page=1&limit=20` e `GET /api/users/:id`: exigem `ADMIN`, retornam apenas campos públicos. Limite máximo: 100.

No Swagger, há autorizações separadas para access token e refresh token.

O modelo mantém **um refresh token ativo por usuário**, como no Sellow. Novo login substitui a renovação anterior. Cada token inclui um identificador aleatório; o refresh é armazenado como SHA-256 do JWT completo e trocado atomicamente. Duas renovações simultâneas com o mesmo token produzem um sucesso e um 401. No frontend, serialize a renovação e substitua os dois tokens após o sucesso.

Senhas usam bcrypt com custo 12, mínimo de 8 caracteres no cadastro e máximo de 72 bytes UTF-8. Emails são normalizados para minúsculas, e a restrição única também protege cadastros concorrentes. Campos como `role`, `isActive` e `refreshToken` não são aceitos nos DTOs públicos.

Logout revoga o refresh. Access tokens já emitidos continuam válidos até expirar, desde que a conta exista e esteja ativa. Para revogação imediata por sessão ou múltiplos dispositivos, evolua para uma tabela `Session`; o template atual usa a semântica do Sellow.

O cadastro sempre cria `USER`. Para desenvolvimento, cadastre uma conta e altere seu `role` para `ADMIN` no `pnpm prisma:studio`. Em produção, faça o provisionamento administrativo por um procedimento controlado do projeto; não há promoção pública nem credencial padrão.

Workspaces, leads, integrações Apify e outros domínios do Sellow não fazem parte desta base. Recuperação de senha, confirmação de email e login social podem ser adicionados como módulos conforme a necessidade.

## Configuração

Veja `.env.example`. Valores inválidos interrompem a inicialização sem imprimir os segredos.

- `NODE_ENV`: `development`, `test` ou `production`.
- `PORT`: padrão 3000. `APP_NAME`: título da API e do Swagger.
- `API_PREFIX`: padrão `api`, um segmento sem barras.
- `APP_CORS_ORIGINS`: origens HTTP(S) explícitas, separadas por vírgula, sem barra final. `FRONTEND_URL` também é aceito como fallback para facilitar uso no estilo do Sellow.
- `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET`: obrigatórios, diferentes, com pelo menos 32 caracteres. Gere valores aleatórios próprios por projeto e ambiente.
- `JWT_ACCESS_EXPIRES` e `JWT_REFRESH_EXPIRES`: durações inteiras com `s`, `m`, `h` ou `d`; padrões `15m` e `7d`.
- `ALLOW_REGISTRATION`: `true` ou `false`; quando omitido, habilitado em desenvolvimento/teste e desabilitado em produção. `false` funciona em qualquer ambiente.
- `SWAGGER_ENABLED`: quando omitido, habilitado fora de produção. Se habilitado, `/docs` e `/docs-json` ficam públicos.
- `TRUST_PROXY_HOPS`: padrão 0. Configure o número exato de proxies confiáveis da infraestrutura para que o limite por IP funcione corretamente.

Helmet habilita cabeçalhos de segurança. O limite global é de 100 requisições por minuto, por IP e rota; login usa 10/min e cadastro 5/min. Health checks não são limitados. O armazenamento do limitador é em memória: para múltiplas réplicas, use armazenamento compartilhado ou aplique o limite no gateway.

Cada resposta recebe `X-Request-Id`; os logs HTTP incluem método, caminho sem query string, status e duração. Erros seguem `{ statusCode, message, error, path, requestId, timestamp }`. Falhas internas retornam mensagem genérica. Senhas e tokens não aparecem no perfil nem nos logs HTTP.

## Banco e migrations

Em `development` e `test`, a aplicação usa `LOCAL_DATABASE_URL`, com padrão `file:./dev.db` relativo à raiz do projeto. Em `production`, usa exclusivamente `DATABASE_URL` (`libsql://...`) e `DATABASE_AUTH_TOKEN`.

Para alterar o schema:

```sh
pnpm prisma:migrate --name nome_da_mudanca
pnpm prisma:generate
```

Versione o schema e o SQL gerado em `src/prisma/migrations`. Para aplicar migrations já existentes a um SQLite novo, use `pnpm prisma:migrate:deploy`. Os scripts inicializam o arquivo SQLite preservando bancos existentes, evitando o erro vazio de criação do engine observado no Windows. Execute os scripts a partir da raiz.

**`prisma:migrate:deploy` atua no SQLite local, inclusive quando `NODE_ENV=production`.** Ele não migra Turso. A aplicação e o CLI têm alvos distintos por escolha explícita, como no Sellow.

Para Turso, gere e revise o SQL localmente e aplique cada migration pendente uma única vez, em ordem, usando o Turso CLI. Exemplo em PowerShell, substituindo banco e caminho:

```powershell
Get-Content -Raw src/prisma/migrations/20260906020726_init/migration.sql | turso db shell NOME_DO_BANCO
```

Em Bash:

```sh
turso db shell NOME_DO_BANCO < src/prisma/migrations/20260906020726_init/migration.sql
```

Mantenha um registro das migrations aplicadas no processo de deploy. Esse fluxo via SQL não preenche o histórico `_prisma_migrations` no Turso e não oferece controle automático de reaplicação. Valide mudanças em um banco de staging antes de aplicá-las ao banco definitivo. Veja o [fluxo Prisma/Turso documentado pelo Turso](https://docs.turso.tech/sdk/ts/orm/prisma).

## Build e produção

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start:prod
```

Forneça `NODE_ENV=production`, os segredos JWT, `DATABASE_URL`, `DATABASE_AUTH_TOKEN` e as origens reais de CORS pelo ambiente de execução. Configure `ALLOW_REGISTRATION=false` e `SWAGGER_ENABLED=false`, a menos que o produto precise desses recursos públicos. Não reutilize o `.env` de desenvolvimento no deploy.

O build compila também o client gerado em `dist/generated/prisma`; não precisa de `cp`, Bash ou cópia manual de arquivos. O entrypoint é `dist/main.js`. A etapa de build precisa das dependências de desenvolvimento; o runtime precisa de `dist` e das dependências de produção. Instale dependências na plataforma de destino porque bcrypt/libSQL incluem componentes nativos.

## Verificação

```sh
pnpm check
pnpm format:check
```

`check` executa lint, checagem de tipos, testes unitários, testes de integração com SQLite real e build. Os testes de integração criam um banco temporário por execução, aplicam as migrations versionadas e removem o banco após o processo terminar, sem usar `dev.db` nem credenciais Turso.

Os testes unitários ficam junto do código em arquivos `*.spec.ts`: `auth.service.spec.ts`, `users.service.spec.ts`, `health.controller.spec.ts`, os guards de access/refresh e permissões, e a configuração. Eles isolam dependências para verificar regras, recusas de acesso e falhas de persistência. Os testes em `test/app.e2e-spec.ts` exercitam as rotas HTTP, a composição dos módulos e o Prisma com SQLite real.

Execute `pnpm test --runInBand` para os unitários, `pnpm test -- auth.service` para filtrar um módulo, ou `pnpm test:e2e` para a integração. Novas regras de negócio devem receber testes próximos ao service correspondente.

O workflow de CI executa no Linux com Node 24. Execute `pnpm lint:fix` e `pnpm format` para ajustes automáticos.

### O que a CI faz

O arquivo `.github/workflows/ci.yml` configura a integração contínua (CI) no GitHub Actions. Em cada push ou pull request, o GitHub instala as dependências pelo lockfile e executa formatação, lint, tipos, testes e build no Linux. Isso ajuda a identificar uma alteração que quebrou o projeto antes de integrá-la ao trabalho da equipe. Para impedir merges quando a verificação falhar, configure os checks como obrigatórios nas regras de proteção da branch do repositório.

Este workflow faz somente CI. Entrega/deploy contínuo (CD) seria uma etapa adicional para publicar uma versão no servidor ou plataforma escolhida. O template não contém deploy automático, não publica a API e não aplica migrations ao Turso. O workflow passa a executar quando o projeto é enviado a um repositório GitHub com Actions habilitado; localmente, o equivalente é `pnpm check`.

## Reutilizar em outro projeto

Copie os arquivos versionados, ajuste `name` e `description` do `package.json` e `APP_NAME`, gere um novo `.env` com `pnpm setup:env`, aplique as migrations e acrescente seus módulos. Não copie `.env`, `dev.db`, `node_modules`, `dist` ou `src/generated`. Configure um banco Turso próprio ao preparar o deploy.
