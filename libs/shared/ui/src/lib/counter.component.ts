import { Component, computed, effect, signal, untracked } from "@angular/core";
import { IonButton, IonCol, IonGrid, IonInput, IonItem, IonLabel, IonRow } from "@ionic/angular/standalone";

const DEFAULT_COUNTER = {
  count: 0,
  ticking: false,
  speed: 1000,
  up: true,
  diff: 1,
  adhocCount: 10,
};

@Component({
  selector: 'bk-counter',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol, IonButton, IonItem, IonLabel, IonInput
  ],
  styles: [`
  h1 { height: 400px; width: 100%; font-size: 10rem; text-align: center;}
  `],
  template: `
    <ion-grid>
      <ion-row>
        <ion-col>
          <ion-item>
            <ion-label><h1>{{counter().count}}</h1></ion-label>
          </ion-item>          
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col><ion-button (click)="start()">Start</ion-button></ion-col>
        <ion-col><ion-button (click)="stop()">Stop</ion-button></ion-col>
        <ion-col><ion-button (click)="reset()">Reset</ion-button></ion-col>
      </ion-row>
      <ion-row>
        <ion-col size-sm="6" size-md="4" size="12">
          <ion-item lines="none">
            <ion-input name="count" #countEl
              [value]="adhocCount()"
              (ionChange)="setCount(+(countEl?.value ?? 0))"
              label="Set Count"
              labelPlacement="floating"
              inputMode="decimal"
              type="number"
              [counter]="true"
              [maxlength]="4"
              [clearInput]="true">
            </ion-input>
          </ion-item>
        </ion-col>
        <ion-col size-sm="6" size-md="4" size="12">
          <ion-item lines="none">
            <ion-input name="diff" #diffEl
              [value]="diff()"
              (ionChange)="incrementBy(+(diffEl?.value ?? 0))"
              label="Increment By"
              labelPlacement="floating"
              inputMode="decimal"
              type="number"
              [counter]="true"
              [maxlength]="4"
              [clearInput]="true">
            </ion-input>
          </ion-item>
        </ion-col>
        <ion-col size-sm="6" size-md="4" size="12">
          <ion-item lines="none">
            <ion-input name="speed" #speedEl
              [value]="speed()"
              (ionChange)="setSpeed(+(speedEl?.value ?? 0))"
              label="Tick Speed (ms)"
              labelPlacement="floating"
              inputMode="decimal"
              type="number"
              [counter]="true"
              [maxlength]="4"
              [clearInput]="true">
            </ion-input>
          </ion-item>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col>
          <ion-button (click)="countUp()">Direction: Up</ion-button>
        </ion-col>
        <ion-col>
          <ion-button (click)="countDown()">Direction: Down</ion-button>
        </ion-col>
      </ion-row>
    </ion-grid>
  `
})
  export class CounterComponent {
    // signals
    public counter = signal(DEFAULT_COUNTER);

    // derived signals
    private readonly ticking = computed(() => this.counter().ticking);
    public speed = computed(() => this.counter().speed);
    public diff = computed(() => this.counter().diff);
    private readonly up = computed(() => this.counter().up);
    public adhocCount = computed(() => this.counter().adhocCount);
  
    public start = () => this.counter.update((v) => ({ ...v, ticking: true }));
    public stop = () => this.counter.update((v) => ({ ...v, ticking: false }));
    public countUp = () => this.counter.update((v) => ({ ...v, up: true }));
    public countDown = () => this.counter.update((v) => ({ ...v, up: false }));
    public incrementBy = (diff: number) => this.counter.update((v) => ({ ...v, diff }));
    public setSpeed = (speed: number) => this.counter.update((v) => ({ ...v, speed }));
    public setCount = (count: number) => this.counter.update((v) => ({ ...v, count, adhocCount: count }));
    public setAdhocCount = (adhocCount: number) => this.counter.update((v) => ({ ...v, adhocCount }));
    public reset = () => this.counter.set(DEFAULT_COUNTER);
  
    private readonly ticker = effect(() => {
      const ticking = this.ticking();
      const speed = this.speed();
      const diff = this.diff();
      const up = this.up();
      untracked(() => this.tick(ticking, speed, diff, up));
    });
  
    private interval: NodeJS.Timeout | undefined = undefined;

    private tick(ticking: boolean, speed: number, diff: number, up: boolean) {
      clearInterval(this.interval);
      if (ticking) {
        const increment = up ? diff : diff * -1;
        this.interval = setInterval(
          () =>
            this.counter.update((v) => ({ ...v, count: v.count + increment })),
          speed
        );
      }
    }
  }
