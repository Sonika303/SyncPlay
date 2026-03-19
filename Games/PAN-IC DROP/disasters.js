const DisasterSystem = {
    blender: { active: false, timer: 0, x: 300, y: 300, rotation: 0 },
    hotTile: { active: false, x: -1, y: -1 },
    soaps: [],
    powerups: [], // Magnet, Clock
    lastMisery: 0,

    triggerRandom(time) {
        if (time - this.lastMisery < 5000) return;
        this.lastMisery = time;

        const rand = Math.random();
        const label = document.getElementById('warning-label');
        
        if (rand < 0.25) {
            this.blender.active = true; this.blender.timer = 300;
            this.showLabel("🌪️ BLENDER ACTIVE!", label);
        } else if (rand < 0.50) {
            this.hotTile.active = true;
            this.hotTile.x = Math.floor(Math.random() * 12) * 50;
            this.hotTile.y = Math.floor(Math.random() * 12) * 50;
            this.showLabel("🔥 HOT STOVE!", label);
            setTimeout(() => this.hotTile.active = false, 4000);
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
        el.innerText = txt; el.classList.add('show-warning');
        setTimeout(() => el.classList.remove('show-warning'), 2500);
    },

    draw(ctx, time) {
        if (this.hotTile.active) {
            ctx.fillStyle = "rgba(255, 0, 0, 0.6)";
            ctx.fillRect(this.hotTile.x, this.hotTile.y, 50, 50);
            ctx.strokeStyle = "white"; ctx.strokeRect(this.hotTile.x+5, this.hotTile.y+5, 40, 40);
        }
        if (this.blender.active) {
            this.blender.timer--; if (this.blender.timer <= 0) this.blender.active = false;
            ctx.save(); ctx.translate(300, 300); this.blender.rotation += 0.3;
            ctx.rotate(this.blender.rotation);
            ctx.fillStyle = "#90a4ae";
            for(let i=0; i<4; i++) { ctx.rotate(Math.PI/2); ctx.fillRect(-5, -70, 10, 140); }
            ctx.restore();
        }
        this.soaps.forEach(s => {
            ctx.fillStyle = "#81d4fa"; ctx.fillRect(s.x-15, s.y-10, 30, 20);
        });
        this.powerups.forEach(p => {
            ctx.fillStyle = p.type === 'MAGNET' ? "#f44336" : "#4caf50";
            ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "white"; ctx.font = "12px Arial";
            ctx.fillText(p.type === 'MAGNET' ? "U" : "T", p.x-4, p.y+5);
        });
    }
};