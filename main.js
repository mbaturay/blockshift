class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
  }

  preload() {
    this.load.image('logo', 'assets/logo_s.png');
    // Load assets (placeholder for now)
  }

  create() {
    this.HUD_HEIGHT = 80;

    // --- Start Screen Title ---
    this.startState = true;
    // Remove text title, use logo image instead
    this.startLogo = this.add.image(
      this.game.config.width / 2,
      this.game.config.height / 2 - 60,
      'logo'
    ).setOrigin(0.5).setAlpha(0).setScale(0.7);
    this.tweens.add({
      targets: this.startLogo,
      alpha: 1,
      scale: 1,
      duration: 800,
      ease: 'Power2',
    });

    // --- HUD: new layout ---
    const pad = 24;
    let hudY = this.HUD_HEIGHT / 2;
    // Level and Floor: left-aligned, same line
    const smallFont = { font: '18px "Iceland"', fill: '#222', align: 'left' }; // Changed font
    this.levelText = this.add.text(pad, hudY, 'Level: 1', smallFont).setOrigin(0, 0.5);
    this.floorText = this.add.text(0, hudY, 'Floor: 1 / 6', smallFont).setOrigin(0, 0.5);
    // Score: center
    this.scoreText = this.add.text(this.game.config.width / 2, hudY, 'Score: 0', { font: '24px "Iceland"', fill: '#222', align: 'center' }).setOrigin(0.5, 0.5); // Changed font
    // High score: right-aligned
    this.highScore = parseInt(localStorage.getItem('spysReturnHighScore')) || 0;
    this.highScoreText = this.add.text(this.game.config.width - pad, hudY, 'High Score: ' + this.highScore, { font: '18px "Iceland"', fill: '#222', align: 'right' }).setOrigin(1, 0.5); // Match Level/Floor font size

    // Position Level and Floor next to each other, left side
    this.levelText.x = pad;
    this.floorText.x = pad + this.levelText.width + pad / 2;
    this.levelText.y = hudY;
    this.floorText.y = hudY;
    // Score stays centered
    this.scoreText.x = this.game.config.width / 2;
    this.scoreText.y = hudY;
    // High score stays at right
    this.highScoreText.x = this.game.config.width - pad;
    this.highScoreText.y = hudY;

    // --- Gameplay Area Offset ---
    // Level/floor setup
    this.level = 1;
    this.floor = 0;
    this.floorsPerLevel = 6;
    this.currentFloor = 1; // Track current floor (1-based)
    this.floorHeight = 100;
    this.levelBoost = 20;
    this.floorBoost = 5;

    // Score setup
    this.score = 0;
    this.floorPoints = 50;
    this.levelBonus = 100;
    this.swipeBonus = 100; // Skill-based floor bonus for single-direction traversal

    // Distance-based score accumulation
    this.distanceTraveled = 0;
    this.movementScoreRate = 1;
    this.movementScoreThreshold = 10;
    this.lastPlayerX = 0;

    // Player setup (Y offset by HUD_HEIGHT)
    this.direction = 'right';
    this.playerActualDirection = null;
    this.player = this.add.rectangle(0 + 30, this.getFloorY(0), 60, 30, 0x0077ff);
    this.playerSpeed = 200;
    this.playerPaused = true;
    this.justCrossed = false;
    this.setPlayerPosition();

    // Elevators setup
    this.createElevators();

    // Debug Mode Setup
    this.debugMode = false;
    this.debugGraphics = this.add.graphics(); // Create graphics layer for debug visuals

    // Invulnerability Setup
    this.invulnerable = false;
    this.invulnerabilityDuration = 300; // milliseconds
    this.invulnerabilityTimer = null;
    this.originalPlayerColor = 0x0077ff; // Matches player creation color
    this.invulnerablePlayerColor = 0xffff00; // Yellow for invulnerability tint

    // Collision Leniency for more forgiving collisions
    this.collisionLeniency = { horizontal: 5, vertical: 3 }; // In pixels, reduces hitbox size

    // Input for pausing/resuming
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.spaceKey.on('down', () => {
      if (this.startState) {
        this.startState = false;
        this.tweens.add({
          targets: this.startLogo,
          alpha: 0,
          scale: 0.7,
          duration: 400,
          ease: 'Power2',
          onComplete: () => this.startLogo.setVisible(false)
        });
        this.playerPaused = false;
        return;
      }
      if (this.gameOver) {
        this.resetGame();
      }
      // Removed: else if (this.playerPaused) ...
      // Removed: else { this.playerPaused = true; }
    });

    this.rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.rKey.on('down', () => {
      if (this.gameOver) {
        this.resetGame();
      }
    });

    this.dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.dKey.on('down', () => {
      this.debugMode = !this.debugMode;
      if (!this.debugMode) {
        this.debugGraphics.clear(); // Clear graphics when turning off debug mode
      }
    });

    this.cursors = this.input.keyboard.createCursorKeys();
    this.moving = false; // Player starts stationary, waits for first input on a floor
    // Remove: this.playerPaused = true; // Start paused

    this.gameOver = false;
    this.gameOverText = null;

    this.highScoreText.setInteractive({ useHandCursor: true });
    this.highScoreText.on('pointerdown', (pointer) => {
      if (pointer && pointer.event && pointer.event.detail === 2) { // double click
        this.highScore = 0;
        localStorage.setItem('spysReturnHighScore', '0');
        this.highScoreText.setText('High Score: 0');
      }
    });

    // Developer-only: collision toggle
    this.ignoreCollisions = false;
    this.toggleCollisionKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.toggleCollisionKey.on('down', () => {
      this.ignoreCollisions = !this.ignoreCollisions;
      this.updateCollisionIndicator();
    });
    this.createCollisionIndicator();
    this.updateCollisionIndicator();

    // --- Elevator Tethers ---
    this.tetherGraphics = this.add.graphics();
    this.tethersVisible = false; // Start with tethers off

    // Key for toggling tethers
    this.tKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.tKey.on('down', () => {
      this.tethersVisible = !this.tethersVisible;
      if (!this.tethersVisible) {
        this.tetherGraphics.clear();
      }
    });

    this.transitioning = false; // Block input during level/floor transitions

    // --- Grid Background ---
    this.gridOffsetX = 0;
    this.gridOffsetY = 0; // Added for vertical parallax
    this.parallaxFactor = 0.3; 
    this.gridVerticalScrollFactor = 0.4; // How much grid moves vertically on floor change (factor of floorHeight)
    this.gridLevelChangeScrollFraction = 0.75; // How much grid "pages up" on level change (factor of game view height)
    this.gridVerticalTween = null; // To manage the vertical animation of the grid
    this.gridGraphics = this.add.graphics();
    this.drawGrid();
  }

  drawGrid() {
    this.gridGraphics.clear();
    const gridSize = 50; 
    const gridColor = 0xcccccc; 
    const gridAlpha = 0.5; 

    this.gridGraphics.lineStyle(1, gridColor, gridAlpha); // Set line style once for both

    // Calculate the visual starting X position for the vertical lines
    // This ensures the pattern repeats correctly as gridOffsetX changes.
    let startX = -(this.gridOffsetX % gridSize);
    
    // Adjust startX if gridOffsetX is negative to ensure correct tiling
    // JS % with negative numbers: -10 % 50 = -10. So startX becomes 10.
    // If gridOffsetX is positive: 10 % 50 = 10. So startX becomes -10.
    // This behavior correctly shifts the grid in the opposite direction of parallaxFactor sign.

    // Draw vertical lines
    for (let x = startX; x < this.game.config.width; x += gridSize) {
      this.gridGraphics.beginPath();
      this.gridGraphics.moveTo(x, this.HUD_HEIGHT);
      this.gridGraphics.lineTo(x, this.game.config.height);
      this.gridGraphics.strokePath();
    }
    // If startX is positive (meaning grid has scrolled to the right, player moved left),
    // we need to draw one more line to the left to cover the gap.
    if (startX > 0) {
        this.gridGraphics.beginPath();
        this.gridGraphics.moveTo(startX - gridSize, this.HUD_HEIGHT);
        this.gridGraphics.lineTo(startX - gridSize, this.game.config.height);
        this.gridGraphics.strokePath();
    }
    // If startX is negative (meaning grid has scrolled to the left, player moved right),
    // we might need an extra line to the right if the loop condition `x < this.game.config.width`
    // stops one line too short. However, the loop `x < this.game.config.width` should generally suffice
    // as lines are drawn *at* x, and the last one will be just before width or slightly over if startX is negative.

    // Draw horizontal lines with vertical parallax
    let currentFirstLineY = -(this.gridOffsetY % gridSize);
    // Adjust currentFirstLineY to be the first line at or after HUD_HEIGHT
    while (currentFirstLineY < this.HUD_HEIGHT) {
        currentFirstLineY += gridSize;
    }

    for (let y = currentFirstLineY; y < this.game.config.height; y += gridSize) {
      this.gridGraphics.beginPath();
      this.gridGraphics.moveTo(0, y);
      this.gridGraphics.lineTo(this.game.config.width, y);
      this.gridGraphics.strokePath();
    }

    this.gridGraphics.setDepth(-1); 
  }

  getFloorY(floorIdx) {
    // Returns the Y position for a given floor, offset by HUD_HEIGHT
    return this.game.config.height - ((floorIdx + 1) * this.floorHeight) + this.HUD_HEIGHT;
  }

  setPlayerPosition() {
    // Set player Y based on floor, X based on direction, respecting HUD_HEIGHT
    this.player.y = this.getFloorY(this.floor);
    if (this.direction === 'right') {
      this.player.x = this.player.width / 2;
    } else {
      this.player.x = this.game.config.width - this.player.width / 2;
    }
    this.lastPlayerX = this.player.x;
    this.distanceTraveled = 0;
  }

  createElevators() {
    // Clear tethers before destroying and recreating elevators to avoid visual artifacts
    if (this.tetherGraphics) {
      this.tetherGraphics.clear();
    }
    if (this.elevators) {
      for (const elevator of this.elevators) {
        elevator.rect.destroy();
      }
    }
    this.elevators = [];
    const elevatorWidth = 20;
    const elevatorHeight = 60;
    const numberOfElevators = 6;

    // Define movement limits for elevators (below HUD bar)
    const screenMinY = this.HUD_HEIGHT + elevatorHeight / 2;
    const screenMaxY = this.game.config.height - elevatorHeight / 2;
    const amplitude = (screenMaxY - screenMinY) / 2;
    const centerY = (screenMinY + screenMaxY) / 2;

    const spacingX = this.game.config.width / (numberOfElevators + 1);

    for (let i = 0; i < numberOfElevators; i++) {
      const elevatorX = spacingX * (i + 1);
      const baseSpeed = Phaser.Math.Between(80, 160);
      const speed = baseSpeed + (this.level * this.levelBoost) + (i * this.floorBoost);
      const phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const initialY = centerY;
      const rect = this.add.rectangle(elevatorX, initialY, elevatorWidth, elevatorHeight, 0xff4444);
      this.elevators.push({
        rect,
        speed,
        phase,
        centerY,
        amplitude,
        id: i
      });
    }
  }

  activateInvulnerability() {
    this.invulnerable = true;
    this.player.setFillStyle(this.invulnerablePlayerColor);

    if (this.invulnerabilityTimer) {
      this.invulnerabilityTimer.remove(false); // Remove existing timer if any, false to prevent its onComplete
    }

    this.invulnerabilityTimer = this.time.delayedCall(this.invulnerabilityDuration, () => {
      this.invulnerable = false;
      this.player.setFillStyle(this.originalPlayerColor);
      this.invulnerabilityTimer = null; // Clear the timer reference
    }, [], this);
  }

  update(time, delta) {
    const playerXAtFrameStart = this.player.x;

    if (this.startState) return;
    if (this.gameOver) return;

    // Always update elevators and tethers
    for (const elevator of this.elevators) {
      elevator.rect.y = elevator.centerY + elevator.amplitude * Math.sin((time / 1000) * (elevator.speed / 100) + elevator.phase);
    }
    this.tetherGraphics.clear();
    if (this.tethersVisible) {
      for (const elevator of this.elevators) {
        const x = elevator.rect.x;
        const y = elevator.rect.y - elevator.rect.height / 2;
        const color = elevator.rect.fillColor || 0x999999;
        this.tetherGraphics.lineStyle(2, color, 1);
        this.tetherGraphics.strokeLineShape(new Phaser.Geom.Line(x, this.HUD_HEIGHT, x, y));
      }
    }

    // Gameplay logic (input, player movement, debug) - skipped during transitions
    if (!this.transitioning) {
      // Debug mode: Draw hitboxes
      this.debugGraphics.clear(); // Clear previous frame\'s debug drawings
      if (this.debugMode) {
        this.debugGraphics.lineStyle(2, 0x00ff00, 1); // Green lines for hitboxes

        // Player hitbox
        const playerBounds = this.player.getBounds();
        this.debugGraphics.strokeRectShape(playerBounds);

        // Elevators hitboxes
        for (const elevator of this.elevators) {
          const elevatorBounds = elevator.rect.getBounds();
          this.debugGraphics.strokeRectShape(elevatorBounds);
        }
      }

      // Player input sets the actual movement direction
      if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
        if (!this.moving) {
          this.initialDirection = 'left';
          this.brokeBonusStreak = false;
        } else if (this.initialDirection !== 'left') {
          this.brokeBonusStreak = true;
        }
        this.playerActualDirection = 'left';
        this.moving = true;
      } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
        if (!this.moving) {
          this.initialDirection = 'right';
          this.brokeBonusStreak = false;
        } else if (this.initialDirection !== 'right') {
          this.brokeBonusStreak = true;
        }
        this.playerActualDirection = 'right';
        this.moving = true;
      }

      // Player movement logic, only if not paused
      if (!this.playerPaused) {
        if (this.moving && this.playerActualDirection) {
          const moveSign = (this.playerActualDirection === 'right' ? 1 : -1);
          const moveAmount = this.playerSpeed * (delta / 1000) * moveSign;
          this.player.x += moveAmount;

          // Clamp player to screen bounds
          this.player.x = Phaser.Math.Clamp(this.player.x, this.player.width / 2, this.game.config.width - this.player.width / 2);

          // Distance-based scoring
          if (this.moving) {
            const deltaX = Math.abs(this.player.x - this.lastPlayerX);
            this.distanceTraveled += deltaX;
            
            while (this.distanceTraveled >= this.movementScoreThreshold) {
              this.score += this.movementScoreRate;
              this.updateScoreText();
              this.distanceTraveled -= this.movementScoreThreshold;
            }
            this.lastPlayerX = this.player.x;
          }

          // Check for collisions AFTER player has moved and score for movement is calculated
          if (this.checkCollision()) {
            return; // Game over was triggered, stop further processing this frame
          }

          const atLeftEdge = this.player.x <= this.player.width / 2;
          const atRightEdge = this.player.x >= this.game.config.width - this.player.width / 2;

          // Progression check
          if (this.playerActualDirection === this.direction) {
            if ((this.direction === 'right' && atRightEdge) || 
                (this.direction === 'left' && atLeftEdge)) {
              this.handleFloorCross();
            }
          }
        }
      } // End if !this.playerPaused
    } // End if !this.transitioning

    // Grid updates:
    // Run if transitioning (to show animations) OR if not paused (normal gameplay).
    // This freezes the grid if paused AND not transitioning.
    if (this.transitioning || !this.playerPaused) {
      // Update grid offset based on the total player displacement this frame
      const playerDisplacementThisFrame = this.player.x - playerXAtFrameStart;
      if (playerDisplacementThisFrame !== 0) {
          this.gridOffsetX += playerDisplacementThisFrame * this.parallaxFactor;
      }

      // Redraw the grid with the potentially new offset
      this.drawGrid();
    }
  }

  checkCollision() {
    if (this.ignoreCollisions || this.invulnerable || !this.moving) return false;

    const playerBounds = this.player.getBounds(); // playerBounds.x, .y are top-left
    
    // Create an effective hitbox for the player, reduced by the leniency amounts.
    // This means the player has to overlap the elevator by more than the leniency values
    // for a collision to be registered.
    const effectivePlayerWidth = playerBounds.width - this.collisionLeniency.horizontal;
    const effectivePlayerHeight = playerBounds.height - this.collisionLeniency.vertical;

    // Ensure effective dimensions are not negative
    const finalEffectivePlayerWidth = effectivePlayerWidth > 0 ? effectivePlayerWidth : 0;
    const finalEffectivePlayerHeight = effectivePlayerHeight > 0 ? effectivePlayerHeight : 0;
    
    const playerEffectiveHitbox = new Phaser.Geom.Rectangle(
      playerBounds.x + this.collisionLeniency.horizontal / 2,
      playerBounds.y + this.collisionLeniency.vertical / 2,
      finalEffectivePlayerWidth,
      finalEffectivePlayerHeight
    );

    const playerCenterY = this.player.y; // Center Y of the player GameObject

    for (const elevator of this.elevators) {
      const elevatorRect = elevator.rect; // This is a Phaser.GameObjects.Rectangle
      const elevatorCenterY = elevatorRect.y; // Center Y of the elevator GameObject
      
      // Broad-phase check:
      // Check if the elevator is vertically close enough to the player for a potential collision,
      // based on their original full heights (using center-to-center distance).
      const combinedHalfHeights = (this.player.height / 2) + (elevatorRect.height / 2);

      if (Math.abs(elevatorCenterY - playerCenterY) <= combinedHalfHeights) {
        // Narrow-phase check:
        // Perform the more precise rectangle intersection test using the player's
        // effective (smaller) hitbox and the elevator's original hitbox (obtained via getBounds()).
        const elevatorBounds = elevatorRect.getBounds(); // elevatorBounds.x, .y are top-left
        if (Phaser.Geom.Intersects.RectangleToRectangle(playerEffectiveHitbox, elevatorBounds)) {
          this.triggerGameOver();
          return true; // Collision detected
        }
      }
    }
    return false; // No collision
  }

  triggerGameOver() {
    if (this.gameOver) return; // Already game over

    this.gameOver = true;
    this.moving = false;
    this.playerActualDirection = null;
    this.playerPaused = true; // Stop player input from causing movement

    // Screen Shake
    this.cameras.main.shake(300, 0.015); // Duration 300ms, Intensity 0.015

    // Flash red (concurrently or slightly after shake starts)
    this.cameras.main.flash(300, 255, 0, 0); 

    // Delay Game Over text appearance
    if (this.gameOverText) this.gameOverText.destroy();
    // Create a box for the game over message
    const boxWidth = 320;
    const boxHeight = 90;
    const boxX = this.game.config.width / 2 - boxWidth / 2;
    const boxY = this.game.config.height / 2 - boxHeight / 2;
    if (this.gameOverBox) this.gameOverBox.destroy();
    this.gameOverBox = this.add.graphics();
    this.gameOverBox.fillStyle(0xffffff, 0.95);
    this.gameOverBox.fillRoundedRect(boxX, boxY, boxWidth, boxHeight, 18);
    this.gameOverBox.lineStyle(1, 0x222222, 0.4);
    this.gameOverBox.strokeRoundedRect(boxX, boxY, boxWidth, boxHeight, 18);
    this.gameOverBox.setDepth(1);
    // Game over text (smaller, HUD font)
    this.gameOverText = this.add.text(
      this.game.config.width / 2,
      this.game.config.height / 2,
      'GAME OVER!\nPress SPACE or R to Restart',
      { font: '18px "Iceland"', fill: '#c00', align: 'center' }
    ).setOrigin(0.5).setDepth(2).setVisible(false);
    this.time.delayedCall(300, () => {
      if (this.gameOverText) {
        this.gameOverText.setVisible(true);
        if (this.gameOverBox) this.gameOverBox.setVisible(true);
      }
    }, [], this);
  }

  handleFloorCross() {
    this.moving = false;
    this.playerActualDirection = null;
    this.input.keyboard.resetKeys();
    // --- Floor bonus mechanic ---
    if (this.brokeBonusStreak === false && this.initialDirection !== null) {
      // New scalable clean-run bonus logic
      const baseBonus = 100;
      const levelMultiplier = Math.pow(2, this.level - 1);
      const floorBonus = (this.currentFloor - 1) * 10;
      const totalBonus = baseBonus * levelMultiplier + floorBonus;
      this.score += totalBonus;
      this.updateScoreText();
      // Flash score text and show bonus text near player
      this.tweens.add({
        targets: this.scoreText,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 120,
        yoyo: true,
        ease: 'Power1',
      });
      const bonusText = this.add.text(this.player.x, this.player.y - 40, `+${totalBonus}`,
        { font: '14px Arial', fill: '#00b300', fontStyle: 'bold' })
        .setOrigin(0.5);
      this.tweens.add({
        targets: bonusText,
        y: bonusText.y - 30,
        alpha: 0,
        duration: 700,
        ease: 'Power1',
        onComplete: () => bonusText.destroy()
      });
    }
    const nextFloor = this.floor + 1;
    let isNewLevel = false; // Flag to check if a new level was reached
    let animationDuration;
    let scrollAmountY;

    if (nextFloor >= this.floorsPerLevel) {
      this.score += this.floorPoints;
      this.score += this.levelBonus;
      this.updateScoreText();
      this.level++;
      this.floor = 0;
      this.currentFloor = 1; // Reset to 1 for new level
      this.levelText.setText('Level: ' + this.level);
      this.floorText.setText('Floor: 1 / ' + this.floorsPerLevel);
      this.direction = 'right';
      this.createElevators();
      this.transitioning = true;
      // Use the same animation as a floor advance
      animationDuration = 400;
      scrollAmountY = this.floorHeight * this.gridVerticalScrollFactor;
      if (this.gridVerticalTween && this.gridVerticalTween.isPlaying()) {
        this.gridVerticalTween.stop();
      }
      this.gridVerticalTween = this.tweens.add({
        targets: this,
        gridOffsetY: this.gridOffsetY - scrollAmountY,
        duration: animationDuration,
        ease: 'Power2',
        onComplete: () => { this.gridVerticalTween = null; }
      });
      // Animate player to new level's first floor
      const targetPlayerY = this.getFloorY(0);
      const targetPlayerX = this.player.width / 2;
      this.tweens.add({
        targets: this.player,
        y: targetPlayerY,
        x: targetPlayerX,
        duration: animationDuration,
        ease: 'Power2',
        onComplete: () => {
          this.moving = false;
          this.playerActualDirection = null;
          this.lastPlayerX = this.player.x;
          this.distanceTraveled = 0;
          this.activateInvulnerability();
          this.initialDirection = null;
          this.brokeBonusStreak = false;
          this.input.keyboard.resetKeys();
          this.transitioning = false;
        }
      });
    } else {
      this.score += this.floorPoints;
      this.updateScoreText();
      const newDir = this.direction === 'right' ? 'left' : 'right';
      this.transitioning = true;
      // Start grid tween at the same time as player moves to next floor
      animationDuration = 400;
      scrollAmountY = this.floorHeight * this.gridVerticalScrollFactor;
      if (this.gridVerticalTween && this.gridVerticalTween.isPlaying()) {
        this.gridVerticalTween.stop();
      }
      const gridTweenDuration = 400; // Match player animation duration
      this.gridVerticalTween = this.tweens.add({
        targets: this,
        gridOffsetY: this.gridOffsetY - scrollAmountY, // Changed + to -
        duration: gridTweenDuration,
        ease: 'Power2',
        onComplete: () => { this.gridVerticalTween = null; }
      });
      this.animatePlayerToFloor(nextFloor, newDir, () => {
        this.transitioning = false;
      });
      this.floor = nextFloor;
      this.currentFloor = this.floor + 1; // 1-based for display and bonus
      this.floorText.setText('Floor: ' + (this.floor + 1) + ' / ' + this.floorsPerLevel);
      this.direction = newDir;
    }

    // Reset bonus mechanic for next floor
    this.initialDirection = null;
    this.brokeBonusStreak = false;
  }

  animatePlayerToFloor(floor, direction, onCompleteCb) {
    const newY = this.getFloorY(floor);
    const newX = direction === 'right' ? this.player.width / 2 : this.game.config.width - this.player.width / 2;
    this.tweens.add({
      targets: this.player,
      y: newY,
      x: newX,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        this.moving = false;
        this.playerActualDirection = null;
        this.lastPlayerX = this.player.x;
        this.distanceTraveled = 0;
        this.activateInvulnerability();
        this.initialDirection = null;
        this.brokeBonusStreak = false;
        if (onCompleteCb) onCompleteCb();
      }
    });
  }

  updateScoreText() {
    this.scoreText.setText('Score: ' + this.score);
    // Optional: Add a subtle pop animation to the score text
    this.tweens.add({
      targets: this.scoreText,
      scaleX: 1.15, // Slightly larger pop
      scaleY: 1.15,
      duration: 100, // Quick animation
      ease: 'Power1',
      yoyo: true, // Automatically returns to original scale
      onStart: () => {
        // Optional: Change color during pop
        // this.scoreText.setFill('#00ff00'); 
      },
      onComplete: () => {
        // Optional: Revert color if changed
        // this.scoreText.setFill('#222'); 
      }
    });

    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('spysReturnHighScore', this.highScore);
      this.highScoreText.setText('High Score: ' + this.highScore);
      // Optional: Flash high score text or show "NEW HIGH SCORE!" nearby
      this.tweens.add({
        targets: this.highScoreText,
        alpha: { from: 0.5, to: 1 },
        duration: 150,
        ease: 'Power1',
        yoyo: true,
        repeat: 2 // Flash a few times
      });
    }
  }

  resetGame() {
    if (this.gameOverText) this.gameOverText.destroy();
    this.gameOverText = null;
    if (this.gameOverBox) this.gameOverBox.destroy();
    this.gameOverBox = null;
    this.level = 1;
    this.floor = 0;
    this.currentFloor = 1; // Ensure currentFloor is reset on game restart
    this.score = 0; // Reset score
    this.levelText.setText('Level: 1');
    this.floorText.setText('Floor: 1 / ' + this.floorsPerLevel);
    this.scoreText.setText('Score: 0'); // Reset score display
    this.highScoreText.setText('High Score: ' + this.highScore); // Ensure high score text is accurate
    this.direction = 'right'; // Target direction for floor 0
    this.playerActualDirection = null; // Reset actual direction
    
    this.setPlayerPosition(); // Position player first, this also sets lastPlayerX and resets distanceTraveled

    this.gridOffsetX = 0; // Explicitly reset horizontal grid offset
    this.gridOffsetY = 0; // Explicitly reset vertical grid offset
    if (this.gridVerticalTween && this.gridVerticalTween.isPlaying()) {
      this.gridVerticalTween.stop();
      this.gridVerticalTween = null;
    }

    this.moving = false; // Wait for input
    this.playerPaused = true; // Start in a paused state, requiring input to move
    this.justCrossed = false; // This seems to be unused

    // Reset invulnerability state specifically before activating it for the new game/reset
    this.invulnerable = false;
    if (this.invulnerabilityTimer) {
      this.invulnerabilityTimer.remove(false);
      this.invulnerabilityTimer = null;
    }
    this.player.setFillStyle(this.originalPlayerColor); // Ensure player color is reset to original

    // distanceTraveled is reset by setPlayerPosition
    // lastPlayerX is set by setPlayerPosition

    this.createElevators();
    this.gameOver = false;
    // this.cameras.main.resetFX(); // Not strictly necessary as flash auto-resets

    this.activateInvulnerability(); // Activate for the start of the game
    this.createCollisionIndicator();
    this.updateCollisionIndicator();
    this.playerPaused = false; // Allow movement after reset
  }

  createCollisionIndicator() {
    // Create the collision indicator text just below the HUD bar
    if (!this.collisionOffText) {
      this.collisionOffText = this.add.text(12, this.HUD_HEIGHT + 8, 'Collision: OFF', {
        font: '16px Arial', fill: '#c00', fontStyle: 'bold'
      })
        .setOrigin(0, 0)
        .setDepth(100)
        .setScrollFactor(0);
    }
  }

  updateCollisionIndicator() {
    if (this.collisionOffText) {
      this.collisionOffText.setVisible(!!this.ignoreCollisions);
      // Always keep it just below the HUD bar
      this.collisionOffText.y = this.HUD_HEIGHT + 8;
    }
  }
}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#f0f0f0',
  scene: [MainScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  }
};

const game = new Phaser.Game(config);
