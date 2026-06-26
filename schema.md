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
| `observacao` | `text` | Nullable |
| `criado_em` | `timestamptz` |  |
| `atualizado_em` | `timestamptz` |  |

Observação: há índice único parcial para permitir apenas um ciclo `ativo` por armadilha.
Trocas retroativas devem usar a função `public.registrar_troca_fita`, que valida conflitos, cria o novo ciclo e recalcula `capturas.insetos_novos` sem apagar registros.
Capturas sem ciclo ou inseridas fora do backend podem ser corrigidas com `public.recalcular_capturas_ciclos`; novas inserções também são protegidas pelo trigger `trg_preparar_captura_ciclo`.

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

