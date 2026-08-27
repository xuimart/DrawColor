# Requirements Document

## Introduction

Sistema de licenciamento para o plugin DrawColor (roda de cores para Photoshop CEP/UXP). O sistema monetiza o plugin através de autenticação Google, período de trial de 14 dias, validação server-side via Firebase Cloud Functions, e controle de máquinas simultâneas. O pagamento ocorre externamente (Gumroad, Hotmart ou Stripe) e ativa a licença via webhook no Firestore.

## Glossary

- **Plugin**: A extensão DrawColor que roda dentro do Photoshop (CEP ou UXP)
- **Cloud_Function**: Função serverless hospedada no Firebase Cloud Functions
- **Firestore**: Banco de dados NoSQL do Firebase onde ficam os registros de licença
- **Auth_Service**: Firebase Authentication configurado com provedor Google
- **License_Module**: Módulo JavaScript (`license.js`) no plugin que gerencia autenticação, validação e cache
- **Overlay**: Camada HTML/CSS que bloqueia a interface do plugin quando a licença não é válida
- **Machine_Fingerprint**: Identificador único de máquina composto por hostname + username do sistema operacional
- **Grace_Period**: Período de 4 horas em que o plugin funciona offline usando validação em cache
- **Trial_Period**: Período de 14 dias a partir do primeiro login em que o plugin funciona sem pagamento
- **Validation_Cache**: Registro local com o resultado da última validação e seu timestamp
- **Token**: ID token JWT emitido pelo Firebase Auth após login Google
- **Webhook_Endpoint**: Cloud Function que recebe notificações de pagamento de plataformas externas

## Requirements

### Requisito 1: Autenticação Google

**User Story:** Como usuário do DrawColor, eu quero fazer login com minha conta Google, para que minha licença seja vinculada ao meu email sem criar senha adicional.

#### Critérios de Aceitação

1. WHEN o usuário clica em "Login com Google" no plugin CEP, THE License_Module SHALL abrir o fluxo OAuth no navegador externo do sistema operacional e capturar o token de volta via localhost redirect ou deep link
2. WHEN o token OAuth é recebido pelo plugin, THE License_Module SHALL autenticar no Firebase Auth usando signInWithCredential com o token Google
3. WHEN a autenticação Firebase é bem-sucedida, THE License_Module SHALL armazenar o ID token localmente para uso em chamadas subsequentes à Cloud_Function
4. IF a autenticação falhar por erro de rede ou token inválido, THEN THE License_Module SHALL exibir mensagem de erro descritiva no Overlay e permitir nova tentativa
5. WHEN o usuário clica em "Login com Google" no plugin UXP, THE License_Module SHALL abrir o fluxo OAuth no navegador externo do sistema e capturar o token de volta

### Requisito 2: Registro de Novo Usuário

**User Story:** Como novo usuário, eu quero que minha conta seja criada automaticamente no primeiro login, para que eu comece a usar o plugin imediatamente sem etapas manuais.

#### Critérios de Aceitação

1. WHEN um usuário faz login pela primeira vez, THE Cloud_Function SHALL criar um documento na coleção `users` do Firestore com os campos: email, trialStart (timestamp atual), paid (false), machines (array vazio), e createdAt (timestamp atual)
2. WHEN o documento do usuário já existe no Firestore, THE Cloud_Function SHALL reutilizar o registro existente sem sobrescrever campos
3. THE Cloud_Function SHALL usar o email do token Firebase como identificador único do usuário

### Requisito 3: Gestão do Trial de 14 Dias

**User Story:** Como novo usuário, eu quero testar o DrawColor por 14 dias gratuitamente, para que eu avalie se o plugin atende às minhas necessidades antes de comprar.

#### Critérios de Aceitação

1. WHILE o timestamp atual for menor que trialStart + 14 dias, THE Cloud_Function SHALL retornar status `trial` na resposta de validação
2. WHEN o timestamp atual for maior ou igual a trialStart + 14 dias e o campo paid for false, THE Cloud_Function SHALL retornar status `expired` na resposta de validação
3. THE Cloud_Function SHALL calcular a expiração do trial com base no campo trialStart do documento do usuário no Firestore, sem depender de dados fornecidos pelo cliente
4. WHEN o status retornado é `trial`, THE License_Module SHALL exibir no plugin a quantidade de dias restantes do período de avaliação

### Requisito 4: Validação de Licença (Cloud Function /validate)

**User Story:** Como desenvolvedor do DrawColor, eu quero uma Cloud Function que valide o estado da licença, para que o plugin saiba se deve liberar ou bloquear a interface.

#### Critérios de Aceitação

1. WHEN uma requisição POST é recebida em /validate com token e machineId válidos, THE Cloud_Function SHALL retornar um JSON com campo status contendo um dos valores: `trial`, `active`, `expired`, ou `machine_limit`
2. WHEN o campo paid do usuário é true e o número de máquinas registradas é menor ou igual a 2, THE Cloud_Function SHALL retornar status `active`
3. WHEN o campo paid do usuário é true e a máquina atual já está na lista machines, THE Cloud_Function SHALL retornar status `active` e atualizar o campo lastSeen da máquina
4. WHEN o campo paid do usuário é true e o número de máquinas registradas é 2 e a máquina atual não está na lista, THE Cloud_Function SHALL retornar status `machine_limit`
5. WHEN uma máquina é validada com sucesso (status `trial` ou `active`), THE Cloud_Function SHALL adicionar ou atualizar a entrada da máquina na lista machines com campos id, name, e lastSeen
6. IF o token fornecido for inválido ou expirado, THEN THE Cloud_Function SHALL retornar HTTP 401 com mensagem de erro
7. IF o machineId não for fornecido na requisição, THEN THE Cloud_Function SHALL retornar HTTP 400 com mensagem de erro

### Requisito 5: Controle de Máquinas Simultâneas

**User Story:** Como desenvolvedor do DrawColor, eu quero limitar o uso a 2 máquinas por licença, para que uma compra não seja compartilhada indefinidamente.

#### Critérios de Aceitação

1. THE Cloud_Function SHALL limitar a lista de máquinas ativas a no máximo 2 entradas por usuário
2. WHEN o status retornado é `machine_limit`, THE License_Module SHALL exibir no Overlay a lista de máquinas registradas com opção de desativar uma delas
3. WHEN o usuário solicita desativação de uma máquina, THE License_Module SHALL enviar requisição POST para /deactivate-machine com o token e o id da máquina a remover
4. WHEN uma requisição POST é recebida em /deactivate-machine com token válido e machineId existente na lista, THE Cloud_Function SHALL remover a máquina da lista machines do usuário e retornar sucesso
5. IF o machineId fornecido para desativação não existir na lista machines do usuário, THEN THE Cloud_Function SHALL retornar HTTP 404 com mensagem de erro

### Requisito 6: Machine Fingerprint

**User Story:** Como desenvolvedor do DrawColor, eu quero identificar cada máquina de forma única, para que o controle de máquinas simultâneas funcione corretamente.

#### Critérios de Aceitação

1. WHILE o plugin roda em ambiente CEP, THE License_Module SHALL gerar o Machine_Fingerprint usando hostname e username obtidos via `cep_node.require('os')`
2. WHILE o plugin roda em ambiente UXP, THE License_Module SHALL gerar o Machine_Fingerprint usando as APIs de informação de sistema disponíveis no UXP
3. THE License_Module SHALL compor o Machine_Fingerprint concatenando hostname e username com um separador determinístico
4. THE License_Module SHALL gerar o mesmo Machine_Fingerprint consistentemente na mesma máquina entre execuções do plugin

### Requisito 7: Cache Local e Funcionamento Offline

**User Story:** Como usuário do DrawColor, eu quero que o plugin funcione offline por um período curto após a última validação, para que eu não fique bloqueado por instabilidades de rede.

#### Critérios de Aceitação

1. WHEN a Cloud_Function retorna uma validação bem-sucedida (status `trial` ou `active`), THE License_Module SHALL armazenar localmente o status, o timestamp da validação, e os dias restantes de trial (se aplicável)
2. WHILE o plugin não consegue conectar ao servidor de validação e o Validation_Cache tem menos de 4 horas, THE License_Module SHALL usar o status em cache para liberar a interface
3. WHEN o Validation_Cache tem mais de 4 horas e o plugin não consegue conectar ao servidor, THE License_Module SHALL exibir o Overlay informando que é necessária conexão com a internet para revalidar
4. WHEN o plugin inicia com conexão disponível, THE License_Module SHALL sempre tentar validar online antes de recorrer ao cache
5. THE License_Module SHALL armazenar o Validation_Cache usando o mecanismo de storage local apropriado para a plataforma (localStorage no CEP, arquivo no UXP)

### Requisito 8: Interface de Bloqueio (Overlay)

**User Story:** Como desenvolvedor do DrawColor, eu quero que a interface seja bloqueada quando a licença não é válida, para que o plugin não possa ser usado sem autorização.

#### Critérios de Aceitação

1. WHEN o plugin inicia sem usuário autenticado, THE Overlay SHALL exibir tela de "Ative sua conta" com botão "Login com Google"
2. WHEN o status da licença é `expired`, THE Overlay SHALL exibir mensagem "Trial expirado — Compre sua licença" com botão que direciona à loja externa
3. WHEN o status da licença é `machine_limit`, THE Overlay SHALL exibir mensagem de limite atingido com lista de máquinas registradas e opção de desativação
4. WHILE o Overlay está ativo, THE License_Module SHALL impedir interação com os controles do plugin subjacente
5. THE Overlay SHALL ser implementado de forma que não possa ser removido trivialmente via inspetor de elementos ou manipulação de DOM pelo console
6. WHEN o status da licença é `trial` ou `active`, THE Overlay SHALL ser removido e a interface do plugin liberada para uso

### Requisito 9: Ativação de Licença via Webhook

**User Story:** Como desenvolvedor do DrawColor, eu quero que a licença seja ativada automaticamente após o pagamento, para que o usuário não precise de etapas manuais pós-compra.

#### Critérios de Aceitação

1. WHEN uma requisição POST é recebida em /purchase-webhook com payload válido contendo email do comprador, THE Cloud_Function SHALL definir o campo paid como true no documento do usuário correspondente no Firestore
2. IF o email do payload do webhook não corresponder a nenhum usuário no Firestore, THEN THE Cloud_Function SHALL criar um documento pré-ativado com paid true e trialStart igual ao timestamp atual
3. THE Cloud_Function SHALL validar a autenticidade do webhook usando assinatura ou token secreto específico da plataforma de pagamento
4. IF a assinatura do webhook for inválida, THEN THE Cloud_Function SHALL retornar HTTP 403 e não modificar dados no Firestore

### Requisito 10: Regras de Segurança do Firestore

**User Story:** Como desenvolvedor do DrawColor, eu quero que os dados de licença sejam protegidos no Firestore, para que usuários não possam manipular suas próprias licenças diretamente.

#### Critérios de Aceitação

1. THE Firestore SHALL negar leitura e escrita direta na coleção `users` por clientes autenticados
2. THE Firestore SHALL permitir acesso à coleção `users` exclusivamente via Cloud Functions (admin SDK)
3. THE Cloud_Function SHALL ser o único componente com permissão de escrita nos documentos de licença

### Requisito 11: Estrutura de Dados no Firestore

**User Story:** Como desenvolvedor do DrawColor, eu quero uma estrutura de dados clara para os registros de licença, para que a consulta e manutenção sejam previsíveis.

#### Critérios de Aceitação

1. THE Cloud_Function SHALL armazenar cada usuário como documento na coleção `users` com a seguinte estrutura: email (string), trialStart (timestamp), paid (boolean), machines (array de objetos com id, name e lastSeen), e createdAt (timestamp)
2. THE Cloud_Function SHALL usar o UID do Firebase Auth como identificador do documento na coleção `users`
3. WHEN uma máquina é registrada, THE Cloud_Function SHALL armazenar no objeto da máquina: id (o Machine_Fingerprint), name (nome legível composto por hostname), e lastSeen (timestamp da última validação)

### Requisito 12: Fluxo de Inicialização do Plugin

**User Story:** Como usuário do DrawColor, eu quero que a verificação de licença seja rápida na abertura do plugin, para que eu não espere muito tempo para começar a trabalhar.

#### Critérios de Aceitação

1. WHEN o plugin inicia, THE License_Module SHALL verificar se existe um usuário autenticado em sessão antes de tentar validação online
2. WHEN existe sessão autenticada, THE License_Module SHALL enviar requisição de validação à Cloud_Function com o token atualizado e o Machine_Fingerprint
3. WHEN não existe sessão autenticada e não existe Validation_Cache válido, THE License_Module SHALL exibir o Overlay de login imediatamente
4. IF a validação online falhar por timeout após 5 segundos, THEN THE License_Module SHALL recorrer ao Validation_Cache se disponível e dentro do Grace_Period
5. WHEN a validação é concluída com status `trial` ou `active`, THE License_Module SHALL liberar a interface em menos de 1 segundo após receber a resposta
