import { Component, computed, signal, OnInit, input, booleanAttribute, model, OnDestroy, numberAttribute, output, ChangeDetectionStrategy, HostListener } from '@angular/core';
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
  imports: [MatRippleModule, DragDropModule, MatMenuModule, CommonModule, MatToolbarModule, MatButtonModule, MatIconModule, MatDividerModule],
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

    eventClicked = output<EventCalandar>();
    dayClicked = output<EventCalandar[]>();
    timeSlotClicked = output<DateInterval>();
    eventUpdated = output<EventCalandar>();
    eventCreated = output<DateInterval>();

    protected texteBtnAujourdhui = signal<string>("Today");
    protected prefixSemaine = signal<string>("W");
    protected eventEnCoursDeDrag = signal<PositionedEvent | null>(null);
    protected resizeEnCours = signal<{ id: string | number, dateTime: number, top: number, height: number, formatHeure: string } | null>(null);

    private readonly langueNavigateur = navigator.language || "fr-FR";
    private timerInterval: any;
    private heureActuelle = signal(new Date());
    private dernierTouchTime = 0;

    protected dragCreationEnCours = signal(false);
    protected dateDebutCreation = signal<Date | null>(null);
    protected dateFinCreation = signal<Date | null>(null);

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

    protected styleApercuCreation = computed(() => {
        const debut = this.dateDebutCreation();
        const fin = this.dateFinCreation();
        if (!debut || !fin) return null;

        const minH = this.hourMin();
        const top = ((debut.getHours() - minH) * 60) + debut.getMinutes();
        const hauteur = (((fin.getTime() - debut.getTime()) / 1000) / 60);

        return {
            'top.px': top,
            'height.px': hauteur,
            'display': 'block'
        };
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

    protected OnEventDragStarted(ev: PositionedEvent): void 
    {
        this.eventEnCoursDeDrag.set(ev);
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

    protected OnEventDragEnded(_dragEvent: CdkDragEnd, ev: PositionedEvent): void 
    {
        this.eventEnCoursDeDrag.set(null);

        const distance = _dragEvent.distance;

        // la distance a pas trop bougé click normal
        if (Math.abs(distance.x) < 5 && Math.abs(distance.y) < 5) 
        {
            this.ClickEvent(ev);
            _dragEvent.source._dragRef.reset();
            return;
        }
        
        // calcul largeur d'une colonne
        const GRID_ELEMENT = _dragEvent.source.element.nativeElement.closest('.days-grid');
        const LARGEUR_COLONNE = GRID_ELEMENT ? GRID_ELEMENT.clientWidth / this.listeNomSemaine().length : 1;

        // 2. Calculer le décalage
        // Distance X divisée par largeur colonne = nombre de jours
        const joursDecalage = Math.round(distance.x / LARGEUR_COLONNE);
        const minutesDecalage = Math.round(distance.y / 15) * 15;

        // modifier la date et heures
        let nouvelleDateDebut = new Date(ev.startDate);
        nouvelleDateDebut.setDate(nouvelleDateDebut.getDate() + joursDecalage);
        nouvelleDateDebut.setMinutes(nouvelleDateDebut.getMinutes() + minutesDecalage);

        let nouvelleDateFin = new Date(ev.endDate);
        nouvelleDateFin.setDate(nouvelleDateFin.getDate() + joursDecalage);
        nouvelleDateFin.setMinutes(nouvelleDateFin.getMinutes() + minutesDecalage);

        // 4. On réinitialise visuellement le drag pour que le CSS reprenne le relais
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

    protected InitialiserResize(mouseEvent: MouseEvent | TouchEvent, ev: PositionedEvent, dateJour: Date, direction: 'top' | 'bottom'): void 
    {
        mouseEvent.stopPropagation();
        mouseEvent.preventDefault();

        const cible = mouseEvent.target as HTMLElement;
        const blockElement = cible.closest('.event-block') as HTMLElement;
        
        if (!blockElement) 
            return;

        const topInitial = blockElement.offsetTop;
        const hauteurInitiale = blockElement.offsetHeight;
        const Y_CLIENT_DEBUT = mouseEvent instanceof MouseEvent ? mouseEvent.clientY : mouseEvent.touches[0].clientY;

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => 
        {
            const Y_ACTUELLE = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;
            const DIFFERENCE_Y = Y_ACTUELLE - Y_CLIENT_DEBUT;
            const DIFFERENCE_Y_ARRONDI = Math.round(DIFFERENCE_Y / 15) * 15;

            let nouveauTop = topInitial;
            let nouvelleHauteur = hauteurInitiale;

            if (direction == "bottom") 
                nouvelleHauteur = hauteurInitiale + DIFFERENCE_Y_ARRONDI;

            else if (direction == "top") 
            {
                nouveauTop = topInitial + DIFFERENCE_Y_ARRONDI;
                nouvelleHauteur = hauteurInitiale - DIFFERENCE_Y_ARRONDI;

                if (nouveauTop < 0)
                {
                    nouvelleHauteur += nouveauTop;
                    nouveauTop = 0;
                }
            }

            if (nouvelleHauteur >= 15) 
            {
                // Maj des heures en temps réel
                let minutesDeDifference = (direction == "bottom") 
                    ? nouvelleHauteur - hauteurInitiale 
                    : nouveauTop - topInitial;

                let dateMajDebut = new Date(ev.startDate);
                let dateMajFin = new Date(ev.endDate);

                if (direction == "bottom")
                    dateMajFin.setMinutes(dateMajFin.getMinutes() + minutesDeDifference);

                else
                    dateMajDebut.setMinutes(dateMajDebut.getMinutes() + minutesDeDifference);

                const stringHeureModifiee = this.GenererFormatHeure(dateMajDebut, dateMajFin, this.useAmPm());

                this.resizeEnCours.set({
                    id: ev.id,
                    dateTime: dateJour.getTime(),
                    top: nouveauTop,
                    height: nouvelleHauteur,
                    formatHeure: stringHeureModifiee
                });
            }
        };

        const onMouseUp = () => 
        {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);

            let resizeFini = this.resizeEnCours();
            this.resizeEnCours.set(null);

            if (resizeFini) 
            {
                let nouvelleDateDebut = new Date(ev.startDate);
                let nouvelleDateFin = new Date(ev.endDate);

                if (direction == "bottom") 
                {
                    const minutesEnPlus = resizeFini.height - hauteurInitiale;
                    nouvelleDateFin.setMinutes(nouvelleDateFin.getMinutes() + minutesEnPlus);
                } 
                else if (direction == "top") 
                {
                    const minutesDeDifference = resizeFini.top - topInitial;
                    nouvelleDateDebut.setMinutes(nouvelleDateDebut.getMinutes() + minutesDeDifference);
                }

                this.eventUpdated.emit({
                    id: ev.id,
                    titre: ev.titre,
                    description: ev.description,
                    startDate: nouvelleDateDebut,
                    endDate: nouvelleDateFin
                });
            }
        };

        window.addEventListener('mousemove', onMouseMove);
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

        if (!column) return;

        // 🔥 CORRECTION : RETOUR DU CALCUL DE L'HEURE VIA LES PIXELS !
        const initialRect = column.getBoundingClientRect();
        const clientYDebut = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
        const clientXDebut = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
        
        const yActuel = clientYDebut - initialRect.top;

        let minutesCliquees = Math.floor(yActuel / 15) * 15;
        const minutesTotales = (this.hourMin() * 60) + minutesCliquees;
        const heure = Math.floor(minutesTotales / 60);
        const minute = minutesTotales % 60;

        let dateComplete = new Date(dateJour);
        dateComplete.setHours(heure, minute, 0, 0);
        // 🔥 FIN DE LA CORRECTION

        this.dragCreationEnCours.set(false);
        this.dateDebutCreation.set(dateComplete);
        this.dateFinCreation.set(new Date(dateComplete.getTime() + 15 * 60 * 1000));

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
            if (intentionScroll) 
                return;

            const moveClientY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;
            const moveClientX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;
            
            const deltaY = Math.abs(moveClientY - clientYDebut);
            const deltaX = Math.abs(moveClientX - clientXDebut);

            if (deltaX > 5 || deltaY > 5)
                aBouge = true;

            if (!modeDragCreation) 
            {
                // Si on a bougé le doigt avant la fin des 350ms, c'est qu'on veut scroller !
                if (aBouge) 
                {
                    intentionScroll = true;
                    clearTimeout(timeoutAppuiLong);
                    return;
                }
            } 
            else 
            {
                // MODE DRAG (Appui long réussi ou PC)
                if (aBouge) 
                    this.dragCreationEnCours.set(true);

                if (_moveEvent.cancelable)
                    _moveEvent.preventDefault();

                const currentRect = column.getBoundingClientRect();
                const moveYActuel = moveClientY - currentRect.top;

                let minutesFin = Math.ceil(moveYActuel / 15) * 15;
                const hauteurMax = (this.hourMax() - this.hourMin() + 1) * 60;

                if (minutesFin > hauteurMax) 
                    minutesFin = hauteurMax;

                const totalMinsFin = (this.hourMin() * 60) + minutesFin;
                const hFin = Math.floor(totalMinsFin / 60);
                const mFin = totalMinsFin % 60;

                let dateFinCalc = new Date(dateJour);
                dateFinCalc.setHours(hFin, mFin, 0, 0);

                if (dateFinCalc.getTime() > dateComplete.getTime())
                    this.dateFinCreation.set(dateFinCalc);
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

    protected EstMemeJour(_date1: Date, _date2: Date): boolean 
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