const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const pool = require('../config/pg');
const {
  VALID_JOURNEY_STATUSES,
  normalizeJourneyStatus,
  normalizeUserIdInt,
  transitionPatientStatus,
  createInitialStatusHistory,
} = require('../services/journeyService');

router.use(authMiddleware);

function normalizeCpf(value) {
  const digits = (value || '').toString().replace(/\D/g, '');
  return digits || null;
}

function normalizeDate(value) {
  const text = (value || '').toString().trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) return null;
  const text = value.toString().trim();
  return text.length > 0 ? text : null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function mapPatientResponse(row) {
  return {
    id: row.id,
    nome: row.nome,
    cpf: row.cpf,
    telefone: row.telefone,
    email: row.email,
    dataNascimento: row.dataNascimento,
    status: row.status,
    status_jornada: row.status_jornada,
  };
}

function resolveLoggedUserIdInt(req) {
  return normalizeUserIdInt(req.user?.id);
}

function buildPatientPayload(body, existing = null) {
  const payload = body || {};

  const name = (
    payload.name ??
    payload.nome ??
    existing?.name ??
    existing?.nome ??
    ''
  )
    .toString()
    .trim();

  const rawDateOfBirth =
    payload.date_of_birth ?? payload.data_nascimento ?? existing?.date_of_birth ?? null;
  const dateOfBirth = normalizeDate(rawDateOfBirth);

  const rawStatusJornada = hasOwn(payload, 'status_jornada')
    ? payload.status_jornada
    : existing?.status_jornada;
  const statusJornada = rawStatusJornada
    ? normalizeJourneyStatus(rawStatusJornada)
    : null;

  return {
    name,
    cpf: normalizeCpf(payload.cpf !== undefined ? payload.cpf : existing?.cpf),
    rg: normalizeOptionalText(payload.rg !== undefined ? payload.rg : existing?.rg),
    date_of_birth: dateOfBirth,
    email: normalizeOptionalText(payload.email !== undefined ? payload.email : existing?.email),
    phone: normalizeOptionalText(payload.phone ?? payload.telefone ?? existing?.phone),
    mobile: normalizeOptionalText(payload.mobile ?? payload.celular ?? existing?.mobile),
    address: normalizeOptionalText(payload.address ?? payload.endereco ?? existing?.address),
    number: normalizeOptionalText(payload.number ?? payload.numero ?? existing?.number),
    complement: normalizeOptionalText(
      payload.complement ?? payload.complemento ?? existing?.complement
    ),
    neighborhood: normalizeOptionalText(
      payload.neighborhood ?? payload.bairro ?? existing?.neighborhood
    ),
    city: normalizeOptionalText(payload.city ?? payload.cidade ?? existing?.city),
    state: normalizeOptionalText(payload.state ?? payload.estado ?? existing?.state),
    zip_code: normalizeOptionalText(payload.zip_code ?? payload.cep ?? existing?.zip_code),
    profession: normalizeOptionalText(
      payload.profession ?? payload.profissao ?? existing?.profession
    ),
    marital_status: normalizeOptionalText(
      payload.marital_status ?? payload.estado_civil ?? existing?.marital_status
    ),
    education: normalizeOptionalText(
      payload.education ?? payload.escolaridade ?? existing?.education
    ),
    insurance_plan: normalizeOptionalText(
      payload.insurance_plan ?? payload.convenio ?? existing?.insurance_plan
    ),
    insurance_number: normalizeOptionalText(
      payload.insurance_number ?? payload.numero_convenio ?? existing?.insurance_number
    ),
    notes: normalizeOptionalText(payload.notes ?? payload.observacoes ?? existing?.notes),
    status: normalizeOptionalText(payload.status ?? existing?.status ?? 'pre_cadastro') || 'pre_cadastro',
    status_jornada: statusJornada || 'em_fila_espera',
  };
}

async function findDuplicatePatient({
  client,
  cpf,
  name,
  dateOfBirth,
  excludePatientId = null,
}) {
  if (cpf) {
    const duplicateByCpf = await client.query(
      `
        SELECT id::text AS id
        FROM public.patients
        WHERE regexp_replace(COALESCE(cpf, ''), '\\D', '', 'g') = $1
          AND ($2::text IS NULL OR id::text <> $2::text)
        LIMIT 1
      `,
      [cpf, excludePatientId]
    );

    if (duplicateByCpf.rows.length > 0) {
      return duplicateByCpf.rows[0].id;
    }

    return null;
  }

  if (name && dateOfBirth) {
    const duplicateByNameAndDob = await client.query(
      `
        SELECT id::text AS id
        FROM public.patients
        WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
          AND date_of_birth = $2
          AND ($3::text IS NULL OR id::text <> $3::text)
        LIMIT 1
      `,
      [name, dateOfBirth, excludePatientId]
    );

    if (duplicateByNameAndDob.rows.length > 0) {
      return duplicateByNameAndDob.rows[0].id;
    }
  }

  return null;
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id::text AS id,
          name AS "nome",
          cpf,
          phone AS "telefone",
          email,
          date_of_birth AS "dataNascimento",
          status,
          status_jornada
        FROM public.patients
        ORDER BY created_at DESC
        LIMIT 100
      `
    );

    return res.json({
      success: true,
      total: result.rows.length,
      pacientes: result.rows.map(mapPatientResponse),
    });
  } catch (error) {
    console.error('Erro ao listar pacientes:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar pacientes',
    });
  }
});

router.post('/', async (req, res) => {
  const userIdInt = resolveLoggedUserIdInt(req);
  if (userIdInt === null) {
    return res.status(400).json({
      success: false,
      message: 'Nao foi possivel identificar o usuario logado (users.id inteiro).',
    });
  }

  const payload = buildPatientPayload(req.body);

  if (!payload.name) {
    return res.status(400).json({
      success: false,
      message: 'name (ou nome) e obrigatorio',
    });
  }

  const dateWasProvided =
    hasOwn(req.body, 'date_of_birth') || hasOwn(req.body, 'data_nascimento');
  if (dateWasProvided && !payload.date_of_birth) {
    return res.status(400).json({
      success: false,
      message: 'date_of_birth/data_nascimento invalida. Use YYYY-MM-DD',
    });
  }

  if (!VALID_JOURNEY_STATUSES.has(payload.status_jornada)) {
    return res.status(400).json({
      success: false,
      message: 'status_jornada invalido',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const duplicateId = await findDuplicatePatient({
      client,
      cpf: payload.cpf,
      name: payload.name,
      dateOfBirth: payload.date_of_birth,
    });

    if (duplicateId) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        existing_patient_id: duplicateId,
        message: 'Assistido ja cadastrado (CPF ou nome + data de nascimento).',
      });
    }

    const insertResult = await client.query(
      `
        INSERT INTO public.patients (
          name,
          cpf,
          rg,
          date_of_birth,
          email,
          phone,
          mobile,
          address,
          number,
          complement,
          neighborhood,
          city,
          state,
          zip_code,
          profession,
          marital_status,
          education,
          insurance_plan,
          insurance_number,
          notes,
          status,
          status_jornada
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )
        RETURNING
          id::text AS id,
          name AS "nome",
          cpf,
          phone AS "telefone",
          email,
          date_of_birth AS "dataNascimento",
          status,
          status_jornada
      `,
      [
        payload.name,
        payload.cpf,
        payload.rg,
        payload.date_of_birth,
        payload.email,
        payload.phone,
        payload.mobile,
        payload.address,
        payload.number,
        payload.complement,
        payload.neighborhood,
        payload.city,
        payload.state,
        payload.zip_code,
        payload.profession,
        payload.marital_status,
        payload.education,
        payload.insurance_plan,
        payload.insurance_number,
        payload.notes,
        payload.status,
        payload.status_jornada,
      ]
    );

    await createInitialStatusHistory({
      patientId: insertResult.rows[0].id,
      userIdInt,
      motivoNullable: 'Cadastro criado',
      client,
    });

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      paciente: mapPatientResponse(insertResult.rows[0]),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar paciente:', error);

    if (error?.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Conflito de duplicidade ao criar assistido.',
      });
    }

    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao criar paciente',
    });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const patientId = (req.params?.id || '').toString().trim();
  if (!patientId) {
    return res.status(400).json({ success: false, message: 'id do assistido e obrigatorio' });
  }

  const userIdInt = resolveLoggedUserIdInt(req);
  if (userIdInt === null) {
    return res.status(400).json({
      success: false,
      message: 'Nao foi possivel identificar o usuario logado (users.id inteiro).',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      `
        SELECT *
        FROM public.patients
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [patientId]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Assistido nao encontrado' });
    }

    const existing = existingResult.rows[0];
    const payload = buildPatientPayload(req.body, existing);

    if (!payload.name) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'name (ou nome) e obrigatorio',
      });
    }

    const dateWasProvided =
      hasOwn(req.body, 'date_of_birth') || hasOwn(req.body, 'data_nascimento');
    if (dateWasProvided && !payload.date_of_birth) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'date_of_birth/data_nascimento invalida. Use YYYY-MM-DD',
      });
    }

    const hasRequestedJourneyStatus = hasOwn(req.body, 'status_jornada');
    const requestedJourneyStatus = hasRequestedJourneyStatus
      ? normalizeJourneyStatus(req.body.status_jornada)
      : null;

    if (hasRequestedJourneyStatus && !VALID_JOURNEY_STATUSES.has(requestedJourneyStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'status_jornada invalido',
      });
    }

    const duplicateId = await findDuplicatePatient({
      client,
      cpf: payload.cpf,
      name: payload.name,
      dateOfBirth: payload.date_of_birth,
      excludePatientId: patientId,
    });

    if (duplicateId) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        existing_patient_id: duplicateId,
        message: 'Assistido duplicado (CPF ou nome + data de nascimento).',
      });
    }

    await client.query(
      `
        UPDATE public.patients
        SET name = $1,
            cpf = $2,
            rg = $3,
            date_of_birth = $4,
            email = $5,
            phone = $6,
            mobile = $7,
            address = $8,
            number = $9,
            complement = $10,
            neighborhood = $11,
            city = $12,
            state = $13,
            zip_code = $14,
            profession = $15,
            marital_status = $16,
            education = $17,
            insurance_plan = $18,
            insurance_number = $19,
            notes = $20,
            status = $21,
            updated_at = NOW()
        WHERE id = $22
      `,
      [
        payload.name,
        payload.cpf,
        payload.rg,
        payload.date_of_birth,
        payload.email,
        payload.phone,
        payload.mobile,
        payload.address,
        payload.number,
        payload.complement,
        payload.neighborhood,
        payload.city,
        payload.state,
        payload.zip_code,
        payload.profession,
        payload.marital_status,
        payload.education,
        payload.insurance_plan,
        payload.insurance_number,
        payload.notes,
        payload.status,
        patientId,
      ]
    );

    if (
      hasRequestedJourneyStatus &&
      normalizeJourneyStatus(existing.status_jornada) !== requestedJourneyStatus
    ) {
      await transitionPatientStatus({
        patientId,
        newStatus: requestedJourneyStatus,
        userIdInt,
        motivoNullable: 'Status atualizado no cadastro',
        client,
      });
    }

    const updatedResult = await client.query(
      `
        SELECT
          id::text AS id,
          name AS "nome",
          cpf,
          phone AS "telefone",
          email,
          date_of_birth AS "dataNascimento",
          status,
          status_jornada
        FROM public.patients
        WHERE id = $1
        LIMIT 1
      `,
      [patientId]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      paciente: mapPatientResponse(updatedResult.rows[0]),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar paciente:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao atualizar paciente',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
