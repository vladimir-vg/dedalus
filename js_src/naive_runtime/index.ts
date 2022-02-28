import {
  Runtime, RuntimeOutputListener, TFacts, Facts, Program, Strata,
} from '../runtime';



class NaiveRuntime implements Runtime {
  paused: boolean;
  tillFixpointPromise: Promise<void> | null;

  constructor(program: Program, initialTFacts: TFacts, strata: Strata, options?: any) {
    this.paused = true;
    this.tillFixpointPromise = null;
    // this.initialTFacts = null;
    // this.currentFacts = null;
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

  tick(): Promise<void> {
    if (!!this.tillFixpointPromise) {
      throw new Error('Till fixpoint computation is ongoing');
    }
    throw new Error('Not implemented');
  }
  
  tickTillStateFixpoint(): Promise<void> {
    // if we already have a promise that waits fixpoint then return just it
    if (this.tillFixpointPromise) { return this.tillFixpointPromise; }
  
    let resolveCallback;
    this.tillFixpointPromise = new Promise((resolve, reject) => {
      resolveCallback = resolve;
    });
    
    throw new Error('Not implemented');
    // return this.tillFixpointPromise;
  }

  isFixpointReached(): Promise<boolean> {
    throw new Error('Not implemented');
  }

  isPaused(): boolean {
    return this.paused;
  }

  pause(): Promise<void> {
    if (this.paused) { return Promise.resolve(); }

    throw new Error('Not implemented');

    // return this._pause().then(() => {
    //   this.paused = true;
    //   return;
    // });
  }
}



export {
  NaiveRuntime,
}