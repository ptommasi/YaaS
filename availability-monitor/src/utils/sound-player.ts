import { logger } from "./logger";

var player = require('play-sound')({})

let muted = false;

export function playErrorSound() {
  if (!muted) {
    player.play(
      'data/sound/windows_error.mp3',
      (err: any) => {} //console.log("Error in reproducing the sound: ", err)
    );
  }
}

export function playTaDaSound() {
  if (!muted) {
    player.play(
      'data/sound/ta_da.mp3',
      (err: any) => {} //console.log("Error in reproducing the sound: ", err)
    );
  }
}

export function playTweetSound() {
  if (!muted) {
    player.play(
      'data/sound/twitter.mp3',
      (err: any) => {} //console.log("Error in reproducing the sound: ", err)
    );
  }
}

export function playBipSound() {
  if (!muted) {
    player.play(
      'data/sound/bip.mp3',
      (err: any) => {} //console.log("Error in reproducing the sound: ", err)
    );
  }
}

export function mute() {
  logger.info("Muting notifications sound.")
  muted = true;
}

export function unmute() {
  logger.info("Unmuting notifications sound.")
  muted = false;
}