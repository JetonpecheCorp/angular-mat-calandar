import { Component, computed, signal, OnInit, input, booleanAttribute, model, OnDestroy, numberAttribute, output, ChangeDetectionStrategy, inject, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { EventCalandar } from '../../public-api';
import {MatMenuModule} from '@angular/material/menu';
import { DateInterval } from '../../models/DateInterval';
import { DragDropModule, CdkDragEnd } from '@angular/cdk/drag-drop';
import { DateSpecialEvent } from '../../models/DateSpecialEvent';
import {MatRippleModule} from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

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
  imports: [MatProgressSpinnerModule, MatRippleModule, DragDropModule, MatMenuModule, CommonModule, MatToolbarModule, MatButtonModule, MatIconModule, MatDividerModule],
  templateUrl: './mat-week-calandar.html',
  styleUrls: ['./mat-week-calandar.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MatWeekCalendar implements OnInit, OnDestroy
{
    dateReference = model.required<Date>();
    events = input<EventCalandar[]>([]);
    specialEvents = input<DateSpecialEvent[]>([]);
    mondayFirst = input(false, { transform: booleanAttribute });

    /** 0 min */
    hourMin = input(0, { transform: numberAttribute });

    /** 23 max */
    hourMax = input(23, { transform: numberAttribute });

    /** 0 => Sunday, 6 => Monday */
    daysOfWeekDisabled = input<number[]>([]);
    weekendDisabled = input(false, { transform: booleanAttribute });
    useAmPm = input(false, { transform: booleanAttribute });
    matRippleDisabled = input(false, { transform: booleanAttribute });
    hideNavYearBtn = input(false, { transform: booleanAttribute });
    readonly = input(false, { transform: booleanAttribute });
    loading = input(false, { transform: booleanAttribute });

    eventClicked = output<EventCalandar>();
    dayClicked = output<EventCalandar[]>();
    timeSlotClicked = output<DateInterval>();
    eventUpdated = output<EventCalandar>();
    eventCreated = output<DateInterval>();

    protected texteBtnAujourdhui = signal<string>("Today");
    protected texteEventDragNouveau = signal<string>("new");
    protected prefixSemaine = signal<string>("W");
    protected eventEnCoursDeDrag = signal<PositionedEvent | null>(null);
    protected previewResize = signal<{ eventId: any, startDate: Date, endDate: Date } | null>(null);

    private el = inject(ElementRef);
    private readonly langueNavigateur = navigator.language || "en-US";
    private timerInterval: any;
    private heureActuelle = signal(new Date());
    private dernierTouchTime = 0;
    private semainesDecaleesPendantDrag = 0;
    private navigationInterval: any;

    // pour le scroll horizontal en cas de drag
    private pointerX = 0;
    private pointerY = 0;
    private autoScrollInterval: any = null;

    protected dragCreationEnCours = signal(false);
    protected dateDebutCreation = signal<Date | null>(null);
    protected dateFinCreation = signal<Date | null>(null);
    protected zoneNavigationActive = signal<'left' | 'right' | null>(null);
    protected bulleSurvolee = signal<'left' | 'right' | null>(null);

    protected displayEvents = computed(() => 
    {
        const preview = this.previewResize();
        const baseEvents = this.events() ?? [];

        if (!preview) 
            return baseEvents;

        return baseEvents.map(ev => 
            ev.id == preview.eventId ? { ...ev, startDate: preview.startDate, endDate: preview.endDate } : ev
        );
    });

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

            if (this.jourDeSemaineAExclure().includes(DATE.getDay()))
                continue;

            // --- VÉRIFICATION DE L'INTERVALLE DES ÉVÉNEMENTS SPÉCIAUX ---
            const M = DATE.getMonth() + 1; // 1 => janvier
            const D = DATE.getDate();  

            const eventsSpeciauxDuJour = this.specialEvents().filter(sp => 
            {
                const startM = sp.dateStart.month;
                const startD = sp.dateStart.day;
                const endM = sp.dateEnd.month;
                const endD = sp.dateEnd.day;

                // Gère les intervalles normaux (ex: Mai à Juillet) et ceux à cheval sur l'année (ex: Décembre à Janvier)
                const isNormalInterval = (startM < endM) || (startM === endM && startD <= endD);

                if (isNormalInterval) 
                {
                    return (M > startM || (M === startM && D >= startD)) && (M < endM || (M === endM && D <= endD));
                } 
                else 
                {
                    return (M > startM || (M === startM && D >= startD)) || (M < endM || (M === endM && D <= endD));
                }
            });

            liste.push({
                date: DATE,
                estAujourdhui: this.EstAujourdhui(DATE),
                reduit: DATE.toLocaleString(navigator.language, { weekday: 'short' }).replace('.', ''),
                normal: DATE.toLocaleString(navigator.language, { weekday: 'long' }),
                specialEvents: eventsSpeciauxDuJour
            });
        }

        return liste;
    });

    protected listeToutesSemaines = computed(() => 
    {
        const ref = this.dateReference();
        const ANNEE = ref.getFullYear();
        const weeks = [];
        
        let d = new Date(ANNEE, 0, 1);
        const targetDay = this.mondayFirst() ? 1 : 0;
        
        while (d.getDay() != targetDay) 
        {
            d.setDate(d.getDate() - 1);
        }

        for (let i = 0; i < 53; i++) 
        {
            const start = new Date(d);
            start.setDate(d.getDate() + (i * 7));
            
            if (i > 0 && start.getFullYear() > ANNEE && start.getMonth() > 0) 
                break;

            // On calcule le dimanche (ou samedi) de la même semaine
            const end = new Date(start);
            end.setDate(start.getDate() + 6);

            weeks.push({
                numero: this.RecupererNumeroSemaine(start),
                date: start,
                // On prépare les deux labels
                labelDebut: start.toLocaleDateString(this.langueNavigateur, { day: '2-digit', month: 'short' }),
                labelFin: end.toLocaleDateString(this.langueNavigateur, { day: '2-digit', month: 'short' })
            });
        }

        return weeks;
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
                return `${heureIndex}h`;

            // Logique AM/PM
            let periode = heureIndex >= 12 ? 'PM' : 'AM';
            let heure = heureIndex % 12 || 12;
            
            return `${heure} ${periode}`;
        });
    });

    protected numeroSemaine = computed(() => 
    {
        return this.RecupererNumeroSemaine(this.dateReference());
    });

    protected formatHeureCreation = computed(() => 
    {
        let debut = this.dateDebutCreation();
        let fin = this.dateFinCreation();

        return !debut || !fin ? "" : this.GenererFormatHeure(debut, fin, this.useAmPm());
    });

    private jourDeSemaineAExclure = computed(() => 
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

        const DICT_TRADUCTION_SEMAINE: Record<string, string> = 
        {
            'fr': "S",
            'it': "S",
            'es': "S",
            'pt': "S",
            'en': "W",
            'de': "W"
        };

        this.prefixSemaine.set(DICT_TRADUCTION_SEMAINE[LANGUE] || DICT_TRADUCTION_SEMAINE['en']);

        const DICT_TRADUCTION_NOUVEAU: Record<string, string> = 
        {
            "fr": "nouveau",
            "it": "nuovo",
            "de": "neu",
            "es": "nuevo",
            "pt": "novo",
            "en": "new"
        };

        this.texteEventDragNouveau.set(DICT_TRADUCTION_NOUVEAU[LANGUE] || DICT_TRADUCTION_BTN['en']);
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
        const LISTE_EVENT = this.displayEvents().filter(x =>
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

    protected OnEventDragStarted(ev: PositionedEvent): void 
    {
        this.eventEnCoursDeDrag.set(ev);
        this.semainesDecaleesPendantDrag = 0;
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

    protected AllerAujourdhui(): void
    { 
        this.dateReference.set(new Date()); 
    }

    protected ChoisirSemaine(_date: Date): void
    {
        this.dateReference.set(_date);
    }

    protected OnEventDragMoved(dragEvent: any, ev: PositionedEvent): void 
    {
        // On passe les coordonnées X et Y, et "true" pour dire que c'est un glisser-déposer CDK
        const clientX = dragEvent.pointerPosition.x; 
        const clientY = dragEvent.pointerPosition.y; 
        
        this.pointerX = clientX;
        this.pointerY = clientY;
        this.DemarrerAutoScrollContinu();

        this.GererNavigationBulle(clientX, clientY, true);

        const distance = dragEvent.distance;
        
        const GRID_ELEMENT = dragEvent.source.element.nativeElement.closest('.days-grid');
        const LARGEUR_COLONNE = GRID_ELEMENT ? GRID_ELEMENT.clientWidth / this.listeNomSemaine().length : 1;

        const joursDecalage = Math.round(distance.x / LARGEUR_COLONNE);
        const minutesDecalage = Math.round(distance.y / 15) * 15;

        let nouvelleDateDebut = new Date(ev.startDate);
        nouvelleDateDebut.setDate(nouvelleDateDebut.getDate() + joursDecalage);
        nouvelleDateDebut.setMinutes(nouvelleDateDebut.getMinutes() + minutesDecalage);

        let nouvelleDateFin = new Date(ev.endDate);
        nouvelleDateFin.setDate(nouvelleDateFin.getDate() + joursDecalage);
        nouvelleDateFin.setMinutes(nouvelleDateFin.getMinutes() + minutesDecalage);
    }

    protected OnEventDragEnded(_dragEvent: CdkDragEnd, ev: PositionedEvent): void 
    {
        this.eventEnCoursDeDrag.set(null);
        this.NettoyerNavigationBulle();
        this.ArreterAutoScroll();

        const distance = _dragEvent.distance;

        if (Math.abs(distance.x) < 5 && Math.abs(distance.y) < 5) 
        {
            this.ClickEvent(ev);
            _dragEvent.source._dragRef.reset();
            return;
        }
        
        const GRID_ELEMENT = _dragEvent.source.element.nativeElement.closest('.days-grid');
        const LARGEUR_COLONNE = GRID_ELEMENT ? GRID_ELEMENT.clientWidth / this.listeNomSemaine().length : 1;

        // 👇 MAGIE : On ajoute au décalage les semaines qui ont été sautées pendant le drag !
        const joursDecalage = Math.round(distance.x / LARGEUR_COLONNE) + (this.semainesDecaleesPendantDrag * 7);
        const minutesDecalage = Math.round(distance.y / 15) * 15;

        let nouvelleDateDebut = new Date(ev.startDate);
        nouvelleDateDebut.setDate(nouvelleDateDebut.getDate() + joursDecalage);
        nouvelleDateDebut.setMinutes(nouvelleDateDebut.getMinutes() + minutesDecalage);

        let nouvelleDateFin = new Date(ev.endDate);
        nouvelleDateFin.setDate(nouvelleDateFin.getDate() + joursDecalage);
        nouvelleDateFin.setMinutes(nouvelleDateFin.getMinutes() + minutesDecalage);

        _dragEvent.source._dragRef.reset();

        this.eventUpdated.emit({
            id: ev.id,
            titre: ev.titre,
            description: ev.description,
            startDate: nouvelleDateDebut,
            endDate: nouvelleDateFin
        });
    }

    protected ClickTimeSlot(_dateJour: Date, _heureLabel: string): void 
    {
        let dateDebut = new Date(_dateJour);
        
        let heures = parseInt(_heureLabel, 10);
        
        if (this.useAmPm())
        {
            const estPM = _heureLabel.toLowerCase().includes('pm');

            if (estPM && heures < 12)
                heures += 12;

            if (!estPM && heures == 12) 
                heures = 0;
        }
        
        dateDebut.setHours(heures, 0, 0, 0);
        
        let dateFin = new Date(dateDebut);
        dateFin.setHours(dateDebut.getHours() + 1);
        
        this.timeSlotClicked.emit({ start: dateDebut, end: dateFin });
    }

    protected MoisPrecedent(): void
    {
        const DATE = new Date(this.dateReference());
        DATE.setMonth(DATE.getMonth() - 1);
        this.dateReference.set(DATE);
    }

    protected MoisSuivant(): void
    {
        const DATE = new Date(this.dateReference());
        DATE.setMonth(DATE.getMonth() + 1);
        this.dateReference.set(DATE);
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

    protected InitialiserResize(mouseEvent: MouseEvent | TouchEvent, ev: PositionedEvent, direction: 'top' | 'bottom'): void 
    {
        mouseEvent.stopPropagation();
        mouseEvent.preventDefault();

        // 1. Initialise le fantôme
        this.previewResize.set({ eventId: ev.id, startDate: ev.startDate, endDate: ev.endDate });
        
        let newStart = new Date(ev.startDate);
        let newEnd = new Date(ev.endDate);

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => 
        {
            if (_moveEvent.cancelable) 
                _moveEvent.preventDefault();

            const clientX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;
            const clientY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;
            
            this.pointerX = clientX;
            this.pointerY = clientY;
            this.DemarrerAutoScrollContinu();

            this.GererNavigationBulle(clientX, clientY, false);

            // 2. Détecte la colonne survolée
            const elementUnder = document.elementFromPoint(clientX, clientY);
            const hoveredCol = elementUnder ? elementUnder.closest('.day-column') as HTMLElement : null;

            if (hoveredCol && hoveredCol.dataset['date']) 
            {
                const colTimestamp = parseInt(hoveredCol.dataset['date'], 10);
                const colRect = hoveredCol.getBoundingClientRect();
                
                // 3. Calcule l'heure selon la position Y DANS la colonne survolée
                let yActuel = clientY - colRect.top;
                if (yActuel < 0) yActuel = 0;
                
                let minutesSurvolees = Math.floor(yActuel / 15) * 15;
                const totalMins = (this.hourMin() * 60) + minutesSurvolees;
                const h = Math.floor(totalMins / 60);
                const m = totalMins % 60;

                let hoveredDate = new Date(colTimestamp);
                hoveredDate.setHours(h, m, 0, 0);

                if (direction == 'top') 
                {
                    if (hoveredDate.getTime() >= ev.endDate.getTime()) 
                        hoveredDate = new Date(ev.endDate.getTime() - 15 * 60000);

                    newStart = hoveredDate;
                } 
                else 
                {
                    if (hoveredDate.getTime() <= ev.startDate.getTime())
                        hoveredDate = new Date(ev.startDate.getTime() + 15 * 60000);

                    newEnd = hoveredDate;
                }

                this.previewResize.set({ eventId: ev.id, startDate: newStart, endDate: newEnd });
            }
        };

        const onMouseUp = () => 
        {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);

            this.previewResize.set(null);
            this.NettoyerNavigationBulle();
            this.ArreterAutoScroll();

            if (newStart.getTime() !== ev.startDate.getTime() || newEnd.getTime() !== ev.endDate.getTime()) 
            {
                this.eventUpdated.emit({ ...ev, startDate: newStart, endDate: newEnd });
            }
        };

        window.addEventListener('mousemove', onMouseMove, { passive: false });
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onMouseMove, { passive: false });
        window.addEventListener('touchend', onMouseUp);
    }

    protected EstAujourdhui(_date: Date): boolean
    {
        const DATE = new Date();
        return _date.getDate() == DATE.getDate() && 
            _date.getMonth() == DATE.getMonth() && 
            _date.getFullYear() == DATE.getFullYear();
    }
    
    protected OnMouseDownHoraire(dateJour: Date, event: MouseEvent | TouchEvent): void 
    {
        if (this.readonly()) 
            return;

        // GESTION DU GHOST CLICK MOBILE
        if (event.type == 'touchstart')
            this.dernierTouchTime = Date.now();

        else if (event.type == 'mousedown') 
        {
            // Si on a reçu un touchstart il y a moins de 500ms, on ignore cette fausse souris !
            if (Date.now() - this.dernierTouchTime < 500) return;
        }

        if (event instanceof MouseEvent && event.button !== 0) 
            return;

        const cible = event.target as HTMLElement;
        const column = cible.closest('.day-column') as HTMLElement;

        if (!column) 
            return;

        const initialRect = column.getBoundingClientRect();
        const clientYDebut = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
        const clientXDebut = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
        
        let yActuel = clientYDebut - initialRect.top;
        if (yActuel < 0) yActuel = 0; // Sécurité

        // DATE D'ANCRAGE : On mémorise la case exacte où l'utilisateur a cliqué
        let minutesCliquees = Math.floor(yActuel / 15) * 15;
        const minutesTotales = (this.hourMin() * 60) + minutesCliquees;
        const heure = Math.floor(minutesTotales / 60);
        const minute = minutesTotales % 60;

        let dateComplete = new Date(dateJour);
        dateComplete.setHours(heure, minute, 0, 0);
        const timestampAncrage = dateComplete.getTime();

        this.dragCreationEnCours.set(false);
        this.dateDebutCreation.set(dateComplete);
        this.dateFinCreation.set(new Date(timestampAncrage + 15 * 60 * 1000));

        let intentionScroll = false;
        let modeDragCreation = false; 
        let aBouge = false;
        let timeoutAppuiLong: any;

        // ecran tactile
        if (event.type.startsWith('touch')) 
        {
            // active le drag si on reste appuyer 350ms
            timeoutAppuiLong = setTimeout(() => 
            {
                if (!aBouge) 
                {
                    modeDragCreation = true;
                    this.dragCreationEnCours.set(true);
                    
                    if (navigator.vibrate) 
                        navigator.vibrate(50);
                }
            }, 350);
        } 
        else 
            modeDragCreation = true;

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => 
        {
            if (intentionScroll) return;

            const moveClientY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;
            const moveClientX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;

            if (Math.abs(moveClientX - clientXDebut) > 5 || Math.abs(moveClientY - clientYDebut) > 5) 
                aBouge = true;

            if (!modeDragCreation) 
            {
                if (aBouge) 
                {
                    intentionScroll = true;
                    clearTimeout(timeoutAppuiLong);
                    return;
                }
            } 
            else 
            {
                if (aBouge) this.dragCreationEnCours.set(true);
                if (_moveEvent.cancelable) _moveEvent.preventDefault();

                this.pointerX = moveClientX;
                this.pointerY = moveClientY;
                this.DemarrerAutoScrollContinu();

                this.GererNavigationBulle(moveClientX, moveClientY, false);

                // DÉTECTION DE LA COLONNE SURVOLÉE
                const elementFromPoint = document.elementFromPoint(moveClientX, moveClientY);
                const hoveredCol = elementFromPoint ? elementFromPoint.closest('.day-column') as HTMLElement : null;

                if (hoveredCol && hoveredCol.dataset['date']) 
                {
                    const colTimestamp = parseInt(hoveredCol.dataset['date'], 10);
                    const colRect = hoveredCol.getBoundingClientRect();

                    let yActuel = moveClientY - colRect.top;
                    if (yActuel < 0) yActuel = 0;

                    let minutesSurvolees = Math.floor(yActuel / 15) * 15;
                    const totalMins = (this.hourMin() * 60) + minutesSurvolees;
                    const hSurvole = Math.floor(totalMins / 60);
                    const mSurvole = totalMins % 60;

                    let dateSurvolee = new Date(colTimestamp);
                    dateSurvolee.setHours(hSurvole, mSurvole, 0, 0);
                    const timestampSurvole = dateSurvolee.getTime();

                    // Compare la case survolée avec la toute première case cliquée (ancrage)
                    if (timestampSurvole < timestampAncrage) {
                        this.dateDebutCreation.set(new Date(timestampSurvole));
                        this.dateFinCreation.set(new Date(timestampAncrage + 15 * 60 * 1000));
                    } else {
                        this.dateDebutCreation.set(new Date(timestampAncrage));
                        this.dateFinCreation.set(new Date(timestampSurvole + 15 * 60 * 1000));
                    }
                }
            }
        };

        const onMouseUp = () => 
        {
            clearTimeout(timeoutAppuiLong);
            
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);

            this.dragCreationEnCours.set(false);
            this.NettoyerNavigationBulle();
            this.ArreterAutoScroll();

            if (!intentionScroll) 
            {
                if (!aBouge) 
                {
                    let dateDebutClic = new Date(dateComplete);
                    dateDebutClic.setMinutes(0, 0, 0); 

                    let dateFinClic = new Date(dateDebutClic);
                    dateFinClic.setHours(dateDebutClic.getHours() + 1);
                    
                    this.timeSlotClicked.emit({ start: dateDebutClic, end: dateFinClic });
                } 
                else if (modeDragCreation && aBouge) 
                {
                    let debut = this.dateDebutCreation();
                    let fin = this.dateFinCreation();
                    
                    if (debut && fin)
                        this.eventCreated.emit({ start: debut, end: fin });
                }
            } 

            this.dateDebutCreation.set(null);
            this.dateFinCreation.set(null);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onMouseMove, { passive: false });
        window.addEventListener('touchend', onMouseUp);
    }

    protected styleApercuCreation(colDate: Date): any 
    {
        if (!this.dragCreationEnCours()) return null;
        
        const debut = this.dateDebutCreation();
        const fin = this.dateFinCreation();
        if (!debut || !fin) return null;

        const tCol = new Date(colDate.getFullYear(), colDate.getMonth(), colDate.getDate()).getTime();
        const dMin = new Date(Math.min(debut.getTime(), fin.getTime()));
        const dMax = new Date(Math.max(debut.getTime(), fin.getTime()));

        const tMin = new Date(dMin.getFullYear(), dMin.getMonth(), dMin.getDate()).getTime();
        const tMax = new Date(dMax.getFullYear(), dMax.getMonth(), dMax.getDate()).getTime();

        // Si la colonne qu'on dessine n'est pas comprise dans la sélection, on ne dessine rien !
        if (tCol < tMin || tCol > tMax) return null;

        const minH = this.hourMin();
        const maxH = this.hourMax();

        let hDeb = (tCol === tMin) ? dMin.getHours() : minH;
        let mDeb = (tCol === tMin) ? dMin.getMinutes() : 0;
        
        let hFin = (tCol === tMax) ? dMax.getHours() : maxH + 1; // Le jour du milieu fait toute la hauteur
        let mFin = (tCol === tMax) ? dMax.getMinutes() : 0;

        let top = ((hDeb - minH) * 60) + mDeb;
        let endTotal = ((hFin - minH) * 60) + mFin;
        const maxGrid = (maxH - minH + 1) * 60;

        return {
            'top.px': Math.max(0, top),
            'height.px': Math.min(maxGrid, endTotal) - Math.max(0, top),
            'display': 'flex' // ou block
        };
    }

    protected EstMemeJour(_date1: Date, _date2: Date): boolean 
    {
        return _date1.getFullYear() == _date2.getFullYear() &&
            _date1.getMonth() == _date2.getMonth() &&
            _date1.getDate() == _date2.getDate();
    }

    private DeclencherNavigation(direction: 'left' | 'right', isCdkDrag: boolean): void 
    {
        if (direction == 'left') 
        {
            this.Precedent();
            if (isCdkDrag) 
                this.semainesDecaleesPendantDrag--;
        } 
        else 
        {
            this.Suivant();
            if (isCdkDrag) 
                this.semainesDecaleesPendantDrag++;
        }
    }

    private DemarrerAutoScrollContinu(): void 
    {
        if (this.autoScrollInterval) 
            return;

        this.autoScrollInterval = setInterval(() => 
        {
            // On cible la div qui possède le scroll horizontal et vertical !
            const viewport = this.el.nativeElement.querySelector('.main-scroll-viewport');

            if (!viewport) 
                return;

            const rect = viewport.getBoundingClientRect();
            const MARGE = 50;

            let deltaX = 0;
            let deltaY = 0;

            // Détection X (Droite / Gauche)
            if (this.pointerX > 0 && this.pointerX < rect.left + MARGE) deltaX = -12;
            else if (this.pointerX > 0 && this.pointerX > rect.right - MARGE) deltaX = 12;

            // Détection Y (Bas / Haut) - Super pratique aussi pour scroller les heures !
            if (this.pointerY > 0 && this.pointerY < rect.top + MARGE) deltaY = -12;
            else if (this.pointerY > 0 && this.pointerY > rect.bottom - MARGE) deltaY = 12;

            // Si on est près d'un bord, on fait défiler le calendrier artificiellement
            if (deltaX !== 0 || deltaY !== 0) 
            {
                viewport.scrollLeft += deltaX;
                viewport.scrollTop += deltaY;
            }
        }, 16);
    }

    private ArreterAutoScroll(): void 
    {
        if (this.autoScrollInterval) 
        {
            clearInterval(this.autoScrollInterval);
            this.autoScrollInterval = null;
        }
        this.pointerX = 0;
        this.pointerY = 0;
    }

    // Fonction pour tout arrêter proprement quand on lâche le clic
    private NettoyerNavigationBulle(): void 
    {
        this.zoneNavigationActive.set(null);
        this.bulleSurvolee.set(null);

        if (this.navigationInterval) 
        {
            clearInterval(this.navigationInterval);
            this.navigationInterval = null;
        }
    }

    private GererNavigationBulle(clientX: number, clientY: number, isCdkDrag: boolean = false): void 
    {
        const rect = this.el.nativeElement.getBoundingClientRect();
        const MARGE = Math.max(60, rect.width * 0.1);
        
        let zoneActive: 'left' | 'right' | null = null;
        if (clientX < rect.left + MARGE)
            zoneActive = 'left';

        else if (clientX > rect.right - MARGE) 
            zoneActive = 'right';
        
        this.zoneNavigationActive.set(zoneActive);

        let surLaBulle: 'left' | 'right' | null = null;

        if (zoneActive) 
        {
            const bulleEl = this.el.nativeElement.querySelector(`.nav-edge-indicator.${zoneActive} .nav-bubble`);
            if (bulleEl) 
            {
                const bRect = bulleEl.getBoundingClientRect();
                const padding = 15; 
                
                const estSurLaBulleX = clientX >= bRect.left - padding && clientX <= bRect.right + padding;
                const estSurLaBulleY = clientY >= bRect.top - padding && clientY <= bRect.bottom + padding;

                if (estSurLaBulleX && estSurLaBulleY) 
                    surLaBulle = zoneActive;
            }
        }
        
        // On vérifie si on VIENT d'entrer ou de sortir de la bulle
        if (surLaBulle != this.bulleSurvolee()) 
        {
            // On arrête toujours l'ancien défilement
            if (this.navigationInterval) 
            {
                clearInterval(this.navigationInterval);
                this.navigationInterval = null;
            }

            // Si on vient de se poser sur la bulle
            if (surLaBulle) 
            {
                // On navigue une 1ère fois
                this.DeclencherNavigation(surLaBulle, isCdkDrag);
                
                // On lance un défilement auto toutes les 800ms
                this.navigationInterval = setInterval(() => {
                    this.DeclencherNavigation(surLaBulle, isCdkDrag);
                }, 800);
            }
            
            this.bulleSurvolee.set(surLaBulle);
        }
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
        const formatHeure = (d: Date) => 
        {
            const h = d.getHours();
            const m = d.getMinutes().toString().padStart(2, '0');

            if (!isAmPm) 
                return `${h.toString().padStart(2, '0')}:${m}`;
            
            const period = h >= 12 ? 'PM' : 'AM';
            const displayHour = h % 12 || 12;

            return `${displayHour}:${m} ${period}`;
        };

        // 2. Si l'événement s'étale sur plusieurs jours : Date + Heure
        if (!this.EstMemeJour(start, end)) 
        {
            const formatterDate = new Intl.DateTimeFormat(this.langueNavigateur, { day: 'numeric', month: 'short' });
            return `${formatterDate.format(start)} ${formatHeure(start)} - ${formatterDate.format(end)} ${formatHeure(end)}`;
        }

        return `${formatHeure(start)} - ${formatHeure(end)}`;
    }

    private RecupererNumeroSemaine(_date: Date): number
    {
        let date = new Date(Date.UTC(_date.getFullYear(), _date.getMonth(), _date.getDate()));

        // Ajoute 4 jours à la date pour s'assurer que nous sommes toujours dans la semaine ISO 8601 correcte
        date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
            
        const DATE_DEBUT_ANNEE = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));

        // 86_400_000 => nombre de millisecondes dans un jour
        const NUMERO_SEMAINE = Math.ceil((((date.getTime() - DATE_DEBUT_ANNEE.getTime()) / 86_400_000) + 1) / 7);
        return NUMERO_SEMAINE;
    }
}