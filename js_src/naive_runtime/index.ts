import { Runtime, RuntimeOutputListener, TFacts, Facts, Program } from '../runtime';



class NaiveRuntime extends Runtime {
  constructor(program: Program, initialTFacts: TFacts, options: any) {
    super(program, initialTFacts, options);
  }

  addOutputListener(opts: { key?: string, callback: RuntimeOutputListener }): Promise<void> {
    throw new Error('Not implemented');
  }
  removeOutputListener(opts: { key?: string, callback: RuntimeOutputListener }): Promise<void> {
    throw new Error('Not implemented');
  }

  query(keys: string[]): Promise<Facts> {
    throw new Error('Not implemented');
  }
  
  enqueueInput(facts: Facts) {
    throw new Error('Not implemented');
  }

  _tick(): Promise<void> {
    throw new Error('Not implemented');
  }
  
  _tickTillStateFixpoint(resolve: () => void): Promise<void> {
    throw new Error('Not implemented');
  }

  _pause(): Promise<void> {
    throw new Error('Not implemented');
  }
}



export {
  NaiveRuntime,
}