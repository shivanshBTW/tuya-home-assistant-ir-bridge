import type {
  TrainerCaptureStep,
  TrainerConstraint,
  TrainerFile,
  TrainerParam,
  TrainerSchema,
} from '../types.js';

export const TRAINER_PARAM_MODE = 'mode';
export const TRAINER_PARAM_TEMP = 'temp';
export const TRAINER_PARAM_SPEED = 'speed';
export const TRAINER_PARAM_POWER_SAVING = 'powerSaving';
export const TRAINER_PARAM_POWER = 'power';
export const TRAINER_DEVICE_REMOTE_ID = 'trainer';
const TEMP_SWEEP_INDEXES = [0, 1] as const;

const findParam = (schema: TrainerSchema, paramId: string): TrainerParam => {
  const param = schema.params.find((item) => item.id === paramId);
  if (!param) {
    throw new Error(`Unknown trainer param ${paramId}`);
  }
  return param;
};

const constraintFor = ({
  schema,
  primaryOptionId,
  paramId,
}: {
  schema: TrainerSchema;
  primaryOptionId: string;
  paramId: string;
}): TrainerConstraint => {
  return schema.constraints[primaryOptionId]?.[paramId] ?? { kind: 'all' };
};

export const isSeparateCommandParam = (param: TrainerParam): boolean => {
  return param.isSeparateCommand === true;
};

export const listSeparateCommandParams = (schema: TrainerSchema): TrainerParam[] => {
  return schema.params.filter(
    (param) => param.id !== schema.primaryParamId && isSeparateCommandParam(param),
  );
};

export const normalizeTrainerSchema = (schema: TrainerSchema): TrainerSchema => {
  const params = schema.params.map((param) => {
    if (param.id !== TRAINER_PARAM_POWER_SAVING && param.id !== TRAINER_PARAM_POWER) {
      return param;
    }
    return {
      ...param,
      isSeparateCommand: param.isSeparateCommand ?? true,
    };
  });
  const hasPowerParam = params.some((param) => param.id === TRAINER_PARAM_POWER);
  if (!hasPowerParam) {
    params.push({
      id: TRAINER_PARAM_POWER,
      label: 'Power',
      isSeparateCommand: true,
      options: [{ id: 'off', label: 'Off' }],
    });
  }
  return {
    ...schema,
    params,
    constraints: {
      ...schema.constraints,
      cool: {
        ...(schema.constraints.cool ?? {}),
        [TRAINER_PARAM_POWER]: schema.constraints.cool?.[TRAINER_PARAM_POWER] ?? { kind: 'all' },
      },
      dry: {
        ...(schema.constraints.dry ?? {}),
        [TRAINER_PARAM_POWER]: schema.constraints.dry?.[TRAINER_PARAM_POWER] ?? { kind: 'off' },
      },
      fan_only: {
        ...(schema.constraints.fan_only ?? {}),
        [TRAINER_PARAM_POWER]: schema.constraints.fan_only?.[TRAINER_PARAM_POWER] ?? { kind: 'off' },
      },
    },
    anchorValues: {
      ...schema.anchorValues,
      [TRAINER_PARAM_POWER]: schema.anchorValues[TRAINER_PARAM_POWER] ?? 'off',
    },
  };
};

export const listAllowedOptionIds = ({
  schema,
  paramId,
  primaryOptionId,
}: {
  schema: TrainerSchema;
  paramId: string;
  primaryOptionId: string;
}): string[] => {
  const param = findParam(schema, paramId);
  if (paramId === schema.primaryParamId) {
    return param.options.map((option) => option.id);
  }
  const constraint = constraintFor({ schema, primaryOptionId, paramId });
  if (constraint.kind === 'off') {
    return [];
  }
  if (constraint.kind === 'some') {
    const allowed = new Set(constraint.optionIds ?? []);
    return param.options.filter((option) => allowed.has(option.id)).map((option) => option.id);
  }
  return param.options.map((option) => option.id);
};

export const buildLeftoverValues = ({
  schema,
  primaryOptionId,
}: {
  schema: TrainerSchema;
  primaryOptionId: string;
}): Record<string, string> => {
  const paramValues: Record<string, string> = {
    [schema.primaryParamId]: primaryOptionId,
  };
  for (const param of schema.params) {
    if (param.id === schema.primaryParamId || isSeparateCommandParam(param)) {
      continue;
    }
    const allowedOptionIds = listAllowedOptionIds({
      schema,
      paramId: param.id,
      primaryOptionId,
    });
    if (allowedOptionIds.length === 0) {
      continue;
    }
    const anchorOptionId = schema.anchorValues[param.id];
    paramValues[param.id] =
      anchorOptionId && allowedOptionIds.includes(anchorOptionId)
        ? anchorOptionId
        : (allowedOptionIds[0] ?? '');
  }
  return paramValues;
};

const isNumericOptionList = (optionIds: string[]): boolean => {
  return optionIds.length > 0 && optionIds.every((optionId) => /^-?\d+$/.test(optionId));
};

export const listCycleOptionIds = ({
  optionIds,
  anchorOptionId,
}: {
  optionIds: string[];
  anchorOptionId?: string;
}): string[] => {
  if (optionIds.length === 0) {
    return [];
  }
  const selected = new Set<string>();
  if (isNumericOptionList(optionIds) && optionIds.length > 4) {
    const midIndex = Math.floor(optionIds.length / 2);
    const lastIndex = optionIds.length - 1;
    for (const optionIndex of [...TEMP_SWEEP_INDEXES, midIndex, lastIndex]) {
      const optionId = optionIds[optionIndex];
      if (optionId) {
        selected.add(optionId);
      }
    }
  } else {
    for (const optionId of optionIds) {
      selected.add(optionId);
    }
  }
  if (anchorOptionId && optionIds.includes(anchorOptionId)) {
    selected.add(anchorOptionId);
  }
  return optionIds.filter((optionId) => selected.has(optionId));
};

const optionLabel = (param: TrainerParam, optionId: string): string => {
  return param.options.find((option) => option.id === optionId)?.label ?? optionId;
};

const formatStepLabel = ({
  schema,
  unlockedParamId,
  paramValues,
  kind,
  probeParamId,
  probeIndex,
}: {
  schema: TrainerSchema;
  unlockedParamId: string;
  paramValues: Record<string, string>;
  kind: TrainerCaptureStep['kind'];
  probeParamId?: string;
  probeIndex?: number;
}): string => {
  const unlockedParam = findParam(schema, unlockedParamId);
  const unlockedValue = paramValues[unlockedParamId];
  const parts = schema.params.flatMap((param) => {
    const optionId = paramValues[param.id];
    if (!optionId) {
      return [];
    }
    return [`${param.label} ${optionLabel(param, optionId)}`];
  });
  const prefix =
    kind === 'probe' && probeParamId
      ? `Probe ${probeIndex ?? 1} (${findParam(schema, probeParamId).label} leftover)`
      : `Unlock ${unlockedParam.label}${unlockedValue ? ` → ${optionLabel(unlockedParam, unlockedValue)}` : ''}`;
  return `${prefix}: ${parts.join(', ')}`;
};

export const formatTrainerStateLabel = ({
  schema,
  paramValues,
}: {
  schema: TrainerSchema;
  paramValues: Record<string, string>;
}): string => {
  return schema.params
    .flatMap((param) => {
      const optionId = paramValues[param.id];
      if (!optionId) {
        return [];
      }
      return [`${param.label} ${optionLabel(param, optionId)}`];
    })
    .join(', ');
};

export const trainerStateId = (paramValues: Record<string, string>): string => {
  const pairs = Object.entries(paramValues)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([paramId, optionId]) => `${paramId}=${optionId}`)
    .join(',');
  return `state:${pairs}`;
};

export const listLegalTrainerStates = (schema: TrainerSchema): Record<string, string>[] => {
  const primaryParam = findParam(schema, schema.primaryParamId);
  const states: Record<string, string>[] = [];
  for (const primaryOption of primaryParam.options) {
    const secondaryParams = schema.params.filter(
      (param) => param.id !== schema.primaryParamId && !isSeparateCommandParam(param),
    );
    const walk = (paramIndex: number, paramValues: Record<string, string>): void => {
      if (paramIndex >= secondaryParams.length) {
        states.push(paramValues);
        return;
      }
      const param = secondaryParams[paramIndex];
      if (!param) {
        return;
      }
      const allowedOptionIds = listAllowedOptionIds({
        schema,
        paramId: param.id,
        primaryOptionId: primaryOption.id,
      });
      if (allowedOptionIds.length === 0) {
        walk(paramIndex + 1, paramValues);
        return;
      }
      for (const optionId of allowedOptionIds) {
        walk(paramIndex + 1, { ...paramValues, [param.id]: optionId });
      }
    };
    walk(0, { [schema.primaryParamId]: primaryOption.id });
  }
  return states;
};

export const listSeparateCommandStates = (schema: TrainerSchema): Record<string, string>[] => {
  const states: Record<string, string>[] = [];
  const primaryParam = findParam(schema, schema.primaryParamId);
  for (const param of listSeparateCommandParams(schema)) {
    for (const primaryOption of primaryParam.options) {
      const allowedOptionIds = listAllowedOptionIds({
        schema,
        paramId: param.id,
        primaryOptionId: primaryOption.id,
      });
      if (allowedOptionIds.length === 0) {
        continue;
      }
      const leftoverValues = buildLeftoverValues({
        schema,
        primaryOptionId: primaryOption.id,
      });
      for (const optionId of allowedOptionIds) {
        states.push({
          ...leftoverValues,
          [param.id]: optionId,
        });
      }
    }
  }
  return states;
};

export const trainerStepId = ({
  kind,
  unlockedParamId,
  paramValues,
  probeParamId,
  probeIndex,
}: {
  kind: TrainerCaptureStep['kind'];
  unlockedParamId: string;
  paramValues: Record<string, string>;
  probeParamId?: string;
  probeIndex?: number;
}): string => {
  const pairs = Object.entries(paramValues)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([paramId, optionId]) => `${paramId}=${optionId}`)
    .join(',');
  const probe = kind === 'probe' ? `:${probeParamId ?? ''}:${probeIndex ?? 1}` : '';
  return `${kind}:${unlockedParamId}:${pairs}${probe}`;
};

const toStep = ({
  schema,
  kind,
  unlockedParamId,
  paramValues,
  probeParamId,
  probeIndex,
}: {
  schema: TrainerSchema;
  kind: TrainerCaptureStep['kind'];
  unlockedParamId: string;
  paramValues: Record<string, string>;
  probeParamId?: string;
  probeIndex?: number;
}): TrainerCaptureStep => {
  return {
    id: trainerStepId({ kind, unlockedParamId, paramValues, probeParamId, probeIndex }),
    kind,
    unlockedParamId,
    paramValues,
    ...(probeParamId ? { probeParamId } : {}),
    ...(probeIndex === undefined ? {} : { probeIndex }),
    label: formatStepLabel({
      schema,
      unlockedParamId,
      paramValues,
      kind,
      probeParamId,
      probeIndex,
    }),
  };
};

export const listTrainerCapturePlan = (schema: TrainerSchema): TrainerCaptureStep[] => {
  const primaryOptionId = schema.anchorValues[schema.primaryParamId];
  if (!primaryOptionId) {
    throw new Error('Anchor is missing a primary param value');
  }
  const steps: TrainerCaptureStep[] = [];
  const seen = new Set<string>();
  const addStep = (step: TrainerCaptureStep): void => {
    if (seen.has(step.id)) {
      return;
    }
    seen.add(step.id);
    steps.push(step);
  };

  for (const param of schema.params) {
    if (param.id === schema.primaryParamId) {
      continue;
    }
    const allowedOptionIds = listAllowedOptionIds({
      schema,
      paramId: param.id,
      primaryOptionId,
    });
    const cycleOptionIds = listCycleOptionIds({
      optionIds: allowedOptionIds,
      anchorOptionId: schema.anchorValues[param.id],
    });
    for (const optionId of cycleOptionIds) {
      addStep(
        toStep({
          schema,
          kind: 'cycle',
          unlockedParamId: param.id,
          paramValues: {
            ...buildLeftoverValues({ schema, primaryOptionId }),
            [param.id]: optionId,
          },
        }),
      );
    }
  }

  const primaryParam = findParam(schema, schema.primaryParamId);
  for (const option of primaryParam.options) {
    if (option.id === primaryOptionId) {
      continue;
    }
    addStep(
      toStep({
        schema,
        kind: 'cycle',
        unlockedParamId: schema.primaryParamId,
        paramValues: buildLeftoverValues({ schema, primaryOptionId: option.id }),
      }),
    );
  }

  for (const option of primaryParam.options) {
    if (option.id === primaryOptionId) {
      continue;
    }
    for (const param of schema.params) {
      if (param.id === schema.primaryParamId || isSeparateCommandParam(param)) {
        continue;
      }
      const constraint = constraintFor({
        schema,
        primaryOptionId: option.id,
        paramId: param.id,
      });
      if (constraint.kind !== 'off') {
        continue;
      }
      const leftoverValues = buildLeftoverValues({ schema, primaryOptionId: option.id });
      addStep(
        toStep({
          schema,
          kind: 'probe',
          unlockedParamId: schema.primaryParamId,
          paramValues: leftoverValues,
          probeParamId: param.id,
          probeIndex: 1,
        }),
      );
      addStep(
        toStep({
          schema,
          kind: 'probe',
          unlockedParamId: schema.primaryParamId,
          paramValues: leftoverValues,
          probeParamId: param.id,
          probeIndex: 2,
        }),
      );
    }
  }

  return steps;
};

export const createDefaultAcTrainerSchema = (): TrainerSchema => {
  const tempOptions = Array.from({ length: 15 }, (_, offset) => {
    const temperatureC = 16 + offset;
    return { id: String(temperatureC), label: `${temperatureC}°C` };
  });
  return {
    primaryParamId: TRAINER_PARAM_MODE,
    params: [
      {
        id: TRAINER_PARAM_MODE,
        label: 'Mode',
        options: [
          { id: 'cool', label: 'Cool' },
          { id: 'dry', label: 'Dehumidify' },
          { id: 'fan_only', label: 'Fan only' },
        ],
      },
      { id: TRAINER_PARAM_TEMP, label: 'Temp', options: tempOptions },
      {
        id: TRAINER_PARAM_SPEED,
        label: 'Speed',
        options: [
          { id: 'low', label: 'Low' },
          { id: 'medium', label: 'Medium' },
          { id: 'high', label: 'High' },
        ],
      },
      {
        id: TRAINER_PARAM_POWER_SAVING,
        label: 'Power saving',
        isSeparateCommand: true,
        options: [
          { id: '40', label: '40%' },
          { id: '60', label: '60%' },
          { id: '80', label: '80%' },
          { id: 'off', label: 'Off' },
        ],
      },
      {
        id: TRAINER_PARAM_POWER,
        label: 'Power',
        isSeparateCommand: true,
        options: [{ id: 'off', label: 'Off' }],
      },
    ],
    constraints: {
      cool: {
        [TRAINER_PARAM_TEMP]: { kind: 'all' },
        [TRAINER_PARAM_SPEED]: { kind: 'all' },
        [TRAINER_PARAM_POWER_SAVING]: { kind: 'all' },
        [TRAINER_PARAM_POWER]: { kind: 'all' },
      },
      dry: {
        [TRAINER_PARAM_TEMP]: { kind: 'all' },
        [TRAINER_PARAM_SPEED]: { kind: 'off' },
        [TRAINER_PARAM_POWER_SAVING]: { kind: 'off' },
        [TRAINER_PARAM_POWER]: { kind: 'off' },
      },
      fan_only: {
        [TRAINER_PARAM_TEMP]: { kind: 'off' },
        [TRAINER_PARAM_SPEED]: { kind: 'all' },
        [TRAINER_PARAM_POWER_SAVING]: { kind: 'off' },
        [TRAINER_PARAM_POWER]: { kind: 'off' },
      },
    },
    anchorValues: {
      [TRAINER_PARAM_MODE]: 'cool',
      [TRAINER_PARAM_TEMP]: '24',
      [TRAINER_PARAM_SPEED]: 'medium',
      [TRAINER_PARAM_POWER_SAVING]: 'off',
      [TRAINER_PARAM_POWER]: 'off',
    },
  };
};

export const createEmptyTrainerFile = (): TrainerFile => ({
  updatedAt: new Date().toISOString(),
  schema: createDefaultAcTrainerSchema(),
  samples: [],
});

export const assertTrainerSchema = (schema: TrainerSchema): TrainerSchema => {
  schema = normalizeTrainerSchema(schema);
  if (!Array.isArray(schema.params) || schema.params.length === 0) {
    throw new Error('schema.params is required');
  }
  const paramIds = new Set(schema.params.map((param) => param.id));
  if (!paramIds.has(schema.primaryParamId)) {
    throw new Error('schema.primaryParamId must match a param');
  }
  for (const param of schema.params) {
    if (param.options.length === 0) {
      throw new Error(`Param ${param.id} needs at least one option`);
    }
    const anchorOptionId = schema.anchorValues[param.id];
    if (!anchorOptionId || !param.options.some((option) => option.id === anchorOptionId)) {
      throw new Error(`Anchor is missing a valid value for ${param.id}`);
    }
  }
  return schema;
};
