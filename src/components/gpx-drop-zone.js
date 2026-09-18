/**
 * File intake: drag-and-drop, a file picker, and the bundled sample.
 *
 * Reads text and hands it upward; parsing and validation belong to the caller so this
 * component has no opinion about what a GPX file is.
 */
const SAMPLE_URL = 'sample-ride.gpx';

export class GpxDropZone {
  static bindables = ['fileLoaded', 'compact'];

  dragging = false;
  busy = false;

  /** Guard against a dragleave from a child element clearing the highlight. */
  #dragDepth = 0;

  onDragEnter(event) {
    event.preventDefault();
    this.#dragDepth += 1;
    this.dragging = true;
  }

  onDragOver(event) {
    // Without this the browser navigates to the file instead of firing `drop`.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  onDragLeave() {
    this.#dragDepth = Math.max(0, this.#dragDepth - 1);
    if (this.#dragDepth === 0) this.dragging = false;
  }

  onDrop(event) {
    event.preventDefault();
    this.#dragDepth = 0;
    this.dragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.#read(file);
  }

  onPick(event) {
    const file = event.target.files?.[0];
    if (file) this.#read(file);
    // Clear it so picking the same file twice still fires a change event.
    event.target.value = '';
  }

  async loadSample() {
    this.busy = true;
    try {
      const response = await fetch(SAMPLE_URL);
      if (!response.ok) throw new Error(`Could not load the sample (${response.status}).`);
      this.#emit(await response.text(), 'sample-ride.gpx');
    } catch (error) {
      this.#emit(null, 'sample-ride.gpx', error);
    } finally {
      this.busy = false;
    }
  }

  async #read(file) {
    this.busy = true;
    try {
      this.#emit(await file.text(), file.name);
    } catch (error) {
      this.#emit(null, file.name, error);
    } finally {
      this.busy = false;
    }
  }

  #emit(text, name, error = null) {
    if (typeof this.fileLoaded === 'function') this.fileLoaded({ text, name, error });
  }
}
