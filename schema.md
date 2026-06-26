## Table `armadilhas`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `identificador` | `text` |  Unique |
| `nome` | `text` |  |
| `latitude` | `numeric` |  |
| `longitude` | `numeric` |  |
| `cultura` | `text` |  Nullable |
| `fazenda` | `text` |  Nullable |
| `responsavel` | `text` |  Nullable |
| `status` | `text` |  |
| `ativo` | `bool` |  |
| `criado_em` | `timestamptz` |  |
| `atualizado_em` | `timestamptz` |  |

## Table `capturas`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `armadilha_id` | `uuid` |  |
| `ciclo_fita_id` | `uuid` |  Nullable, FK para `ciclos_fita.id` |
| `capturada_em` | `timestamptz` |  |
| `total_insetos` | `int4` |  |
| `insetos_novos` | `int4` |  |
| `nivel` | `text` |  |
| `confianca_ia` | `numeric` |  Nullable |
| `imagem_url` | `text` |  Nullable |
| `bounding_boxes` | `jsonb` |  Nullable |
| `criado_em` | `timestamptz` |  |

## Table `ciclos_fita`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `armadilha_id` | `uuid` | FK para `armadilhas.id` |
| `iniciado_em` | `timestamptz` |  |
| `encerrado_em` | `timestamptz` |  Nullable |
| `status` | `text` |  `ativo` ou `encerrado` |
| `criado_em` | `timestamptz` |  |
| `atualizado_em` | `timestamptz` |  |

Observação: há índice único parcial para permitir apenas um ciclo `ativo` por armadilha.

## Table `usuarios`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `nome` | `text` |  |
| `email` | `text` |  Unique |
| `senha_hash` | `text` |  |
| `perfil` | `text` |  |
| `ativo` | `bool` |  |
| `criado_em` | `timestamptz` |  |
| `ultimo_login` | `timestamptz` |  Nullable |

