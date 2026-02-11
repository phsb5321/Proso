/**
 * Playback Domain
 *
 * Exports playback state, transitions, and service (when implemented).
 *
 * @module core/playback
 */

export {
  type PlaybackStatus,
  type PlaybackState,
  initialPlaybackState,
  updatePlaybackState,
  playbackStateTransitions,
  playbackStateValidation,
} from './playback-state';

// PlaybackService will be exported here after Phase 3
// export { PlaybackService } from './playback-service';
