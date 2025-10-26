import {GESTURES} from "@/components/gesture-rec.tsx";
import type {Gesture} from "@/components/gesture-rec.tsx";

export const spellKind = {
  fire: 0,
  water: 1,
  plant: 2,
} as const;
export type SpellKind = typeof spellKind[keyof typeof spellKind];

export class Game {
  public targetFireSequence: Array<Gesture>;
  public targetWaterSequence: Array<Gesture>
  public targetPlantSequence: Array<Gesture>;

  public targetSpells: Array<SpellKind>;
  public currentIndex: number = 0;

  public health: number = 100;
  public opponentHealth: number = 100;

  private onSpellCastCallbacks: Array<(spell: SpellKind) => void> = [];
  private onHealthChangeCallbacks: Array<(health: number) => void> = [];
  private onLoseCallbacks: Array<() => void> = [];
  private onOpponentHealthChangeCallbacks: Array<(health: number) => void> = [];

  private fireInterval: number | undefined = undefined;

  constructor() {
    // ensure the random sequences do not match
    const fireSeq: Array<Gesture> = this.getRandomSequence();
    let waterSeq: Array<Gesture>;
    do {
      waterSeq = this.getRandomSequence();
    } while (JSON.stringify(fireSeq) === JSON.stringify(waterSeq));
    let plantSeq: Array<Gesture>;
    do {
      plantSeq = this.getRandomSequence();
    } while (JSON.stringify(fireSeq) === JSON.stringify(plantSeq) || JSON.stringify(waterSeq) === JSON.stringify(plantSeq));

    this.targetFireSequence = fireSeq;
    this.targetWaterSequence = waterSeq;
    this.targetPlantSequence = plantSeq;

    console.log("current sequences:", {
      fire: this.targetFireSequence,
      water: this.targetWaterSequence,
      plant: this.targetPlantSequence,
    });

    this.targetSpells = [
      spellKind.fire,
      spellKind.water,
      spellKind.plant,
    ];
  }

  private getRandomSequence(): Array<Gesture> {
    // generate an array of 3 random gestures, make sure the same type are not
    // next to each other. Also no Nones
    const possibleGestures = [
      GESTURES.closed_fist,
      GESTURES.open_palm,
      GESTURES.thumb_up,
      GESTURES.victory,
      GESTURES.thumb_down,
      GESTURES.iloveyou,
      GESTURES.pointing_up,
    ];
    const sequence: Array<Gesture> = [];
    while (sequence.length < 3) {
      const randIndex = Math.floor(Math.random() * possibleGestures.length);
      const gesture = possibleGestures[randIndex];
      if (sequence.length === 0 || sequence[sequence.length - 1] !== gesture) {
        sequence.push(gesture);
      }
    }
    return sequence;
  }

  public onSpellCast(callback: (spell: SpellKind) => void) {
    this.onSpellCastCallbacks.push(callback);
  }

  public processGesture(detectedGesture: Gesture) {
    // check if the gesture matches ANY of the next gestures expected for ANY spell
    // if it doesnt match any, do nothing, but if it matches at least one, remove the
    // ones not matching from targetSpells

    const matchingSpells: Array<SpellKind> = [];
    for (let i = 0; i < this.targetSpells.length; i++) {
      const spell = this.targetSpells[i];
      let expectedGesture: Gesture;
      switch (spell) {
        case spellKind.fire:
          expectedGesture = this.targetFireSequence[this.currentIndex];
          break;
        case spellKind.water:
          expectedGesture = this.targetWaterSequence[this.currentIndex];
          break;
        case spellKind.plant:
          expectedGesture = this.targetPlantSequence[this.currentIndex];
          break;
      }
      if (detectedGesture === expectedGesture) {
        matchingSpells.push(spell);
      }
    }

    if (matchingSpells.length === 0) {
      // do nothing, no punishment for wrong gesture
      return;
    }
    // update targetSpells to only include matching spells
    this.targetSpells = matchingSpells;

    // if only one spell remains, and at its 3rd gesture, cast it
    if (this.targetSpells.length === 1 && this.currentIndex === 2) {
      const castedSpell = this.targetSpells[0];
      switch (castedSpell) {
        case spellKind.water:
          clearInterval(this.fireInterval);
          this.heal(5);
          break;
        case spellKind.plant:
          this.heal(30);
      }
      // notify listeners
      this.onSpellCastCallbacks.forEach(callback => callback(castedSpell));
      // reset for next spell
      this.currentIndex = 0;
      this.targetSpells = [
        spellKind.fire,
        spellKind.water,
        spellKind.plant,
      ];
      // refresh with new random sequences
      this.targetFireSequence = this.getRandomSequence();
      let waterSeq: Array<Gesture>;
      do {
        waterSeq = this.getRandomSequence();
      } while (JSON.stringify(this.targetFireSequence) === JSON.stringify(waterSeq));
      this.targetWaterSequence = waterSeq;
      let plantSeq: Array<Gesture>;
      do {
        plantSeq = this.getRandomSequence();
      } while (JSON.stringify(this.targetFireSequence) === JSON.stringify(plantSeq) || JSON.stringify(this.targetWaterSequence) === JSON.stringify(plantSeq));
      this.targetPlantSequence = plantSeq;
    } else {
      this.currentIndex++;
    }

    console.log("New sequences:", {
      fire: this.targetFireSequence,
      water: this.targetWaterSequence,
      plant: this.targetPlantSequence,
    });
  }

  private heal(amount: number) {
    this.health += amount;
    if (this.health > 100) this.health = 100;
    this.onHealthChangeCallbacks.forEach(callback => callback(this.health));
  }

  private damage(amount: number) {
    this.health -= amount;
    if (this.health < 0) this.health = 0;
    this.onHealthChangeCallbacks.forEach(callback => callback(this.health));
    if (this.health === 0) {
      this.onLoseCallbacks.forEach(callback => callback());
    }
  }

  public opponentCastSpell(spell: SpellKind) {
    switch (spell) {
      case spellKind.fire:
        // set player on fire, deal 5dps for 10 seconds
        // (actually deal damage per second)
        { let fireTicks = 0;
        clearInterval(this.fireInterval);
        this.fireInterval = setInterval(() => {
          this.damage(5);
          fireTicks++;
          if (fireTicks >= 10) {
            clearInterval(this.fireInterval);
          }
        }, 1000);
        break; }
      default:
        break;
    }
  }

  public onHealthChange(callback: (health: number) => void) {
    this.onHealthChangeCallbacks.push(callback);
  }

  public onLose(callback: () => void) {
    this.onLoseCallbacks.push(callback);
  }

  public onOpponentHealthChange(callback: (health: number) => void) {
    this.onOpponentHealthChangeCallbacks.push(callback);
  }
}