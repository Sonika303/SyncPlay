const DisasterSystem = {
    blender: { active: false, timer: 0, x: 300, y: 300, rotation: 0 },
    hotTile: { active: false, x: -1, y: -1 },
    soaps: [],
    powerups: [], // Magnet, Clock
    lastMisery: 0,

    triggerRandom(time) {
        // Only trigger every 5 seconds
        if (time - this.lastMisery < 5000) return;
        this.lastMisery = time;

        const rand = Math.random();
        const label = document.getElementById('warning-label');
        
        if (rand < 0.25) {
            this.blender.active = true; 
            this.blender.timer = 300;
            this.showLabel("🌪️ BLENDER ACTIVE!", label);
        } else if (rand < 0.50) {
            this.hotTile.active = true;
            this.hotTile.x = Math.floor(Math.random() * 11) * 50 + 25; // Keep away from exact edges
            this.hotTile.y = Math.floor(Math.random() * 11) * 50 + 25;
            this.showLabel("🔥 HOT STOVE!", label);
            setTimeout(() => { this.hotTile.active = false; }, 4000);
        } else if (rand < 0.75) {
            const type = Math.random() > 0.5 ? 'MAGNET' : 'CLOCK';
            this.powerups.push({ x: Math.random()*500+50, y: Math.random()*500+50, type, timer: 400 });
            this.showLabel(type === 'MAGNET' ? "🧲 MAGNET DROPPED!" : "⏰ SLOW-MO CLOCK!", label);
        } else {
            this.soaps.push({ x: Math.random() * 500 + 50, y: Math.random() * 500 + 50 });
            this.showLabel("🧼 SOAP DROP!", label);
        }
    },

    showLabel(txt, el) {
        if (!el) return; // Safety check
        el.innerText = txt; 
        el.classList.add('show-warning');
        setTimeout(() => el.classList.remove('show-warning'), 2500);
    },

    draw(ctx, time) {
        // 1. Draw Hot Tile
        if (this.hotTile.active) {
            ctx.fillStyle = "rgba(255, 69, 0, 0.6)"; // Slightly more orange-red
            ctx.fillRect(this.hotTile.x, this.hotTile.y, 50, 50);
            ctx.strokeStyle = "white"; 
            ctx.lineWidth = 2;
            ctx.strokeRect(this.hotTile.x + 5, this.hotTile.y + 5, 40, 40);
        }

        // 2. Draw Blender
        if (this.blender.active) {
            this.blender.timer--; 
            if (this.blender.timer <= 0) this.blender.active = false;
            
            ctx.save(); 
            ctx.translate(300, 300); 
            this.blender.rotation += 0.4; // Speed it up slightly
            ctx.rotate(this.blender.rotation);
            ctx.fillStyle = "#b0bec5";
            for(let i=0; i<4; i++) { 
                ctx.rotate(Math.PI/2); 
                ctx.fillRect(-5, -80, 10, 160); 
            }
            ctx.restore();
        }

        // 3. Draw Soaps
        this.soaps.forEach((s, index) => {
            ctx.fillStyle = "#81d4fa"; 
            ctx.beginPath();
            ctx.roundRect(s.x-15, s.y-10, 30, 20, 5);
            ctx.fill();
            // Add a little bubble shine
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.fillRect(s.x-10, s.y-7, 8, 4);
        });

        // 4. Draw Powerups
        this.powerups.forEach((p, index) => {
            ctx.fillStyle = p.type === 'MAGNET' ? "#ff5252" : "#4caf50";
            ctx.beginPath(); 
            ctx.arc(p.x, p.y, 18, 0, Math.PI*2); 
            ctx.fill();
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.fillStyle = "white"; 
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.fillText(p.type === 'MAGNET' ? "M" : "S", p.x, p.y+5);
        });
    }
};

// Expose to window so game.js (module) can see it
window.DisasterSystem = DisasterSystem;