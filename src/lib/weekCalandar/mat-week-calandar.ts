import { Component, computed, signal, OnInit, input, booleanAttribute, model, OnDestroy, numberAttribute, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { EventCalandar } from '../../public-api';

interface PositionedEvent extends EventCalandar 
{
    colonne: number;
    nbColonneTotal: number;
    formatHeure: string;
    continueAvant: boolean; 
    continueApres: boolean;
}

@Component({
  selector: 'jp-mat-week-calandar',
  standalone: true,
  imports: [CommonModule, MatToolbarModule, MatButtonModule, MatIconModule, MatDividerModule],
  templateUrl: './mat-week-calandar.html',
  styleUrls: ['./mat-week-calandar.css']
})
export class MatWeekCalendar implements OnInit, OnDestroy
{
    dateReference = model.required<Date>();
    events = input<EventCalandar[]>([]);
    mondayFirst = input(false, { transform: booleanAttribute });

    /** 0 min */
    hourMin = input(0, { transform: numberAttribute });

    /** 23 max */
    hourMax = input(23, { transform: numberAttribute });

    /** 0 => Sunday, 6 => Monday */
    daysOfWeekDisabled = input<number[]>([]);
    weekendDisabled = input(false, { transform: booleanAttribute });
    useAmPm = input(false, { transform: booleanAttribute });

    eventClicked = output<EventCalandar>();
    dayClicked = output<EventCalandar[]>();

    protected texteBtnAujourdhui = signal<string>("Today");

    private readonly langueNavigateur = navigator.language || "fr-FR";
    private timerInterval: any;
    private heureActuelle = signal(new Date());

    protected titrePeriode = computed(() => 
    {
        const LISTE_NOM_SEMAINE = this.listeNomSemaine();

        const debut = LISTE_NOM_SEMAINE[0];
        const fin = LISTE_NOM_SEMAINE[LISTE_NOM_SEMAINE.length - 1];
        const format = new Intl.DateTimeFormat(this.langueNavigateur, { month: 'long', year: 'numeric' });
        
        if (debut.date.getMonth() != fin.date.getMonth())
            return `${format.format(debut.date)} - ${format.format(fin.date)}`;
        
        return format.format(debut.date);
    });

    protected listeNomSemaine = computed(() => 
    {
        const DATE_REF = this.dateReference();
        const jourSemaine = DATE_REF.getDay();

        let diff = 0;
        if (this.mondayFirst())
            diff = (jourSemaine === 0 ? -6 : 1 - jourSemaine);

        else
            diff = -jourSemaine;

        const startOfWeek = new Date(DATE_REF);
        startOfWeek.setDate(DATE_REF.getDate() + diff);

        let liste = [];

        for (let i = 0; i < 7; i++)
        {
            const DATE = new Date(startOfWeek);
            DATE.setDate(startOfWeek.getDate() + i);

            if (this.joursAExclure().includes(DATE.getDay()))
                continue;

            liste.push({
                date: DATE,
                estAujourdhui: this.EstAujourdhui(DATE),
                reduit: DATE.toLocaleString(navigator.language, { weekday: 'short' }).replace('.', ''),
                normal: DATE.toLocaleString(navigator.language, { weekday: 'long' })
            });
        }

        return liste;
    });

    protected positionBarreRouge = computed(() => 
    {
        const maintenant = this.heureActuelle();
        const h = maintenant.getHours();
        const m = maintenant.getMinutes();
        const min = this.hourMin();

        // Si on est avant l'heure mini ou après l'heure maxi, on cache la barre
        if (h < min || h > this.hourMax()) 
            return -100;

        return ((h - min) * 60) + m;
    });

    protected heures = computed(() => 
    {
        const HEURE_MIN = this.hourMin();
        const HEURE_MAX = this.hourMax();
        const EST_AM_PM = this.useAmPm();
        
        return Array.from({ length: HEURE_MAX - HEURE_MIN + 1 }, (_, i) => 
        {
            let heureIndex = HEURE_MIN + i;

            if (!EST_AM_PM) 
                return `${heureIndex}`;

            // Logique AM/PM
            let periode = heureIndex >= 12 ? 'PM' : 'AM';
            let heure = heureIndex % 12 || 12;
            
            return `${heure} ${periode}`;
        });
    });

    private joursAExclure = computed(() => 
    {
        const A_MASQUER = new Set(this.daysOfWeekDisabled());

        if (this.weekendDisabled())
        {
            A_MASQUER.add(0);
            A_MASQUER.add(6);
        }

        return Array.from(A_MASQUER);
    });

    ngOnInit(): void
    {
        this.timerInterval = setInterval(() => 
        {
            this.heureActuelle.set(new Date());
        }, 60_000);

        const LANGUE = this.langueNavigateur.split('-')[0];

        const DICT_TRADUCTION_BTN: Record<string, string> = 
        {
            'fr': "Aujourd'hui",
            'it': "Oggi",
            'de': "Heute",
            'es': "Hoy",
            'pt': "Hoje",
            'en': "Today"
        };

        this.texteBtnAujourdhui.set(DICT_TRADUCTION_BTN[LANGUE] || DICT_TRADUCTION_BTN['en']);
    }

    ngOnDestroy(): void 
    {
        if (this.timerInterval) 
            clearInterval(this.timerInterval);
    }

    private EstDansIntervalle(_dateAChecker: Date, _debut: Date, _fin: Date): boolean
    {
        const DATE = new Date(_dateAChecker.getFullYear(), _dateAChecker.getMonth(), _dateAChecker.getDate()).getTime();
        const DEBUT = new Date(_debut.getFullYear(), _debut.getMonth(), _debut.getDate()).getTime();
        const FIN = new Date(_fin.getFullYear(), _fin.getMonth(), _fin.getDate()).getTime();

        return DATE >= DEBUT && DATE <= FIN;
    }

    protected ClickEvent(_event: EventCalandar): void
    {   
        this.eventClicked.emit({
            id: _event.id,
            startDate: _event.startDate,
            endDate: _event.endDate,
            titre: _event.titre,
            description: _event.description
        });
    }

    protected ClickJour(_date: Date): void
    {
        let liste = this.events().filter(x => this.EstDansIntervalle(_date, x.startDate, x.endDate));
        
        this.dayClicked.emit(liste);
    }

    protected getPositionedEvents(dateJour: Date): PositionedEvent[]
    {
        const LISTE_EVENT = this.events().filter(x =>
        {
            return this.EstDansIntervalle(dateJour, x.startDate, x.endDate);
        })
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || 
                        b.endDate.getTime() - a.endDate.getTime());

        if (LISTE_EVENT.length == 0) 
            return [];

        const positionedEvents: any[] = [];
        let groupeActuelle: any[] = [];
        let maxTimestampFin = 0;

        // création groupes d'événements qui se chevauchent
        LISTE_EVENT.forEach(event => 
        {
            if (event.startDate.getTime() >= maxTimestampFin) 
            {
                // Nouvel événement commence après la fin du groupe actuel : on traite le groupe
                this.AjouterEventAuGroupeColonne(groupeActuelle, positionedEvents, dateJour);
                groupeActuelle = [];
                maxTimestampFin = 0;
            }

            groupeActuelle.push(event);
            maxTimestampFin = Math.max(maxTimestampFin, event.endDate.getTime());
        });
        
        this.AjouterEventAuGroupeColonne(groupeActuelle, positionedEvents, dateJour);
        return positionedEvents;
    }

    protected CalculerStyleEvent(event: EventCalandar, dateJour: Date): any
    {
        const start = new Date(event.startDate);
        const end = new Date(event.endDate);
        const minH = this.hourMin();
        const maxH = this.hourMax();

        const commenceAvant = !this.EstMemeJour(start, dateJour);
        const finitApres = !this.EstMemeJour(end, dateJour);

        let hDeb = commenceAvant ? 0 : start.getHours();
        let mDeb = commenceAvant ? 0 : start.getMinutes();
        let hFin = finitApres ? 24 : end.getHours();
        let mFin = finitApres ? 0 : end.getMinutes();

        if (hFin == 0 && mFin == 0) 
            hFin = 24;

        let top = ((hDeb - minH) * 60) + mDeb;
        let endTotal = ((hFin - minH) * 60) + mFin;
        const maxGrid = (maxH - minH + 1) * 60;

        return {
            'top.px': Math.max(0, top),
            'height.px': Math.min(maxGrid, endTotal) - Math.max(0, top),
            'min-height.px': 15,
            'display': 'flex'
        };
    }

    protected ListerEventsDuJour(_date: Date): EventCalandar[]
    {
        return this.events().filter(ev => 
        {
            const DATE = new Date(ev.startDate);

            return DATE.getDate() === _date.getDate() &&
                   DATE.getMonth() === _date.getMonth() &&
                   DATE.getFullYear() === _date.getFullYear();
        });
    }

    protected AllerAujourdhui(): void
    { 
        this.dateReference.set(new Date()); 
    }

    protected Precedent(): void
    {
        const DATE = new Date(this.dateReference());
        DATE.setDate(DATE.getDate() - 7);
        this.dateReference.set(DATE);
    }

    protected Suivant(): void
    {
        const DATE = new Date(this.dateReference());
        DATE.setDate(DATE.getDate() + 7);
        this.dateReference.set(DATE);
    }

    protected EstAujourdhui(_date: Date): boolean
    {
        const DATE = new Date();
        return _date.getDate() == DATE.getDate() && 
            _date.getMonth() == DATE.getMonth() && 
            _date.getFullYear() == DATE.getFullYear();
    }

    private EstMemeJour(_date1: Date, _date2: Date): boolean 
    {
        return _date1.getFullYear() == _date2.getFullYear() &&
            _date1.getMonth() == _date2.getMonth() &&
            _date1.getDate() == _date2.getDate();
    }

    private AjouterEventAuGroupeColonne(_groupe: EventCalandar[], _listeEventPosition: PositionedEvent[], _dateJour: Date): void
    {
        if (_groupe.length == 0) 
            return;

        const LISTE_COLONNE: EventCalandar[][] = [];
        const isAmPm = this.useAmPm();

        _groupe.forEach(event => 
        {
            let colIndex = 0;
            let estPlacer = false;
            for (let i = 0; i < LISTE_COLONNE.length; i++) 
            {
                const DERNIER_EVENT = LISTE_COLONNE[i][LISTE_COLONNE[i].length - 1];

                if (event.startDate.getTime() >= DERNIER_EVENT.endDate.getTime()) 
                {
                    LISTE_COLONNE[i].push(event);
                    colIndex = i;
                    estPlacer = true;
                    break;
                }
            }

            if (!estPlacer) 
            {
                LISTE_COLONNE.push([event]);
                colIndex = LISTE_COLONNE.length - 1;
            }

            (event as any)._tmpCol = colIndex;
        });

        _groupe.forEach(event => 
        {
            _listeEventPosition.push({
                ...event,
                colonne: (event as any)._tmpCol,
                nbColonneTotal: LISTE_COLONNE.length,
                formatHeure: this.GenererFormatHeure(event.startDate, event.endDate, isAmPm),

                // calcul des flèches
                continueAvant: !this.EstMemeJour(new Date(event.startDate), _dateJour),
                continueApres: !this.EstMemeJour(new Date(event.endDate), _dateJour)
            });
        });
    }

    private GenererFormatHeure(start: Date, end: Date, isAmPm: boolean): string 
    {
        const format = (d: Date) => 
        {
            const h = d.getHours();
            const m = d.getMinutes().toString().padStart(2, '0');

            if (!isAmPm) 
                return `${h.toString().padStart(2, '0')}:${m}`;
            
            const period = h >= 12 ? 'PM' : 'AM';
            const displayHour = h % 12 || 12;

            return `${displayHour}:${m} ${period}`;
        };

        return `${format(start)} - ${format(end)}`;
    }
}