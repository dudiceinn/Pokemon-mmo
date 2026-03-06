const container = document.getElementById('name-labels');

export class NameLabel {
  constructor(name) {
    this.el = document.createElement('div');
    this.el.className = 'name-label';
    this.el.textContent = name;
    container.appendChild(this.el);
  }

  update(sprite, camera) {
    // Sprite top-center in world pixels
    const worldX = sprite.x;
    const worldY = sprite.y - sprite.height * sprite.originY + 30;

    // World to camera-local (in game pixels)
    const camX = worldX - camera.scrollX;
    const camY = worldY - camera.scrollY;

    // Canvas rect gives us actual display size on screen
    const canvas = camera.scene.game.canvas;
    const rect = canvas.getBoundingClientRect();

    // Scale from game pixels to screen pixels
    const scaleX = rect.width / camera.width;
    const scaleY = rect.height / camera.height;

    this.el.style.left = `${rect.left + camX * scaleX}px`;
    this.el.style.top = `${rect.top + camY * scaleY}px`;
  }

  show() {
    this.el.style.display = '';
  }

  hide() {
    this.el.style.display = 'none';
  }

  destroy() {
    this.el.remove();
  }
}
