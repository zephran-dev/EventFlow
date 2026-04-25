import { v4 as uuidv4 } from 'uuid';

export interface PipelineStep {
  name: string;
  queueName: string;
  condition?: string;
  transform?: Record<string, unknown>;
}

export interface PipelineProps {
  id: string;
  name: string;
  steps: PipelineStep[];
  eventTypes: string[];
  enabled: boolean;
  createdAt: Date;
}

export class Pipeline {
  private readonly props: PipelineProps;

  private constructor(props: PipelineProps) {
    this.props = props;
  }

  static create(params: {
    name: string;
    steps: PipelineStep[];
    eventTypes: string[];
  }): Pipeline {
    return new Pipeline({
      id: uuidv4(),
      name: params.name,
      steps: params.steps,
      eventTypes: params.eventTypes,
      enabled: true,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: PipelineProps): Pipeline {
    return new Pipeline(props);
  }

  get id(): string { return this.props.id; }
  get name(): string { return this.props.name; }
  get steps(): PipelineStep[] { return this.props.steps; }
  get eventTypes(): string[] { return this.props.eventTypes; }
  get enabled(): boolean { return this.props.enabled; }

  matchesEventType(eventType: string): boolean {
    return this.props.eventTypes.includes(eventType) || this.props.eventTypes.includes('*');
  }

  toJSON(): PipelineProps {
    return { ...this.props };
  }
}
