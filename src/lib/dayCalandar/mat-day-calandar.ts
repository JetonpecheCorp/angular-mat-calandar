import { Component, computed, signal, OnInit, input, booleanAttribute, model, OnDestroy, HostListener, numberAttribute, output, ChangeDetectionStrategy, inject, ElementRef, effect } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EventCalandar, EventGroup, DateSpecialEvent, ThemeConfigCalandar, SidebarConfigCalandar } from '../../public-api';
import { MatMenuModule, MatMenu } from '@angular/material/menu';
import { DateInterval } from '../../models/DateInterval';
import { MatRippleModule, provideNativeDateAdapter, DateAdapter } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { NgStyle } from '@angular/common';

interface PositionedEvent extends EventCalandar 
{
    colonne: number;
    nbColonneTotal: number;
    formatHeure: string;
    continueAvant: boolean; 
    continueApres: boolean;
}

@Component({
    selector: 'jp-mat-day-calandar',
    standalone: true,
    imports: [MatExpansionModule, MatCheckboxModule, MatSidenavModule, MatProgressSpinnerModule, MatRippleModule, MatMenuModule, MatToolbarModule, MatButtonModule, MatIconModule, MatDatepickerModule, NgStyle],
    templateUrl: './mat-day-calandar.html',
    styleUrls: ['./mat-day-calandar.css'],
    providers: [provideNativeDateAdapter()],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MatDayCalendar implements OnInit, OnDestroy
{
    dateReference = model.required<Date>();
    events = input<EventCalandar[]>([]);
    specialEvents = input<DateSpecialEvent[]>([]);
    groups = input<EventGroup[]>([]);
    customMatMenu = input<MatMenu | null>(null);

    hourMin = input(0, { transform: numberAttribute });
    hourMax = input(23, { transform: numberAttribute });
    langue = input<string>(typeof navigator !== 'undefined' ? navigator.language : 'en');
    daysOfWeekDisabled = input<number[]>([]);
    monthsDisabled = input<number[]>([]);
    daysDisabled = input<Date[]>();
    themeConfig = input<ThemeConfigCalandar>();
    sidebarConfig = input<SidebarConfigCalandar>();

    weekendDisabled = input(false, { transform: booleanAttribute });
    useAmPm = input(false, { transform: booleanAttribute });
    matRippleDisabled = input(false, { transform: booleanAttribute });
    hideNavMonthBtn = input(false, { transform: booleanAttribute });
    showBtnAdd = input(false, { transform: booleanAttribute });
    readonly = input(false, { transform: booleanAttribute });
    readonlyPast = input(false, { transform: booleanAttribute });
    loading = input(false, { transform: booleanAttribute });

    eventClicked = output<EventCalandar>();
    dayClicked = output<EventCalandar[]>();
    timeSlotClicked = output<DateInterval>();
    eventUpdated = output<EventCalandar>();
    eventCreated = output<DateInterval>();
    btnAddClicked = output();
    contextClicked = output<{ action: string, event: EventCalandar }>();

    protected panneauOuvert = signal(false);
    protected groupesMasques = signal<Set<string | number>>(new Set());
    protected estPetitEcran = signal(false);
    protected previewResize = signal<{ eventId: any, startDate: Date, endDate: Date } | null>(null);
    protected isDarkModeActive = signal(false);

    private themeObserver: MutationObserver | null = null;
    private el = inject(ElementRef);
    private dateAdapter = inject(DateAdapter);
    private timerInterval: any;
    private heureActuelle = signal(new Date());
    private dernierTouchTime = 0;
    private navigationInterval: any;
    private pointerX = 0;
    private pointerY = 0;
    private autoScrollInterval: any = null;
    private ignoreBlur = false;
    private focusTimeout: any = null;

    private readonly DICT_TRADUCTION: Record<string, any> = 
    {
        'fr': { 
            aujourdhui: "Aujourd'hui", nouveau: "nouveau", ajouter: "Ajouter", modifier: "Modifier", supprimer: "Supprimer",
            ariaPrecedent: "Jour précédent", ariaSuivant: "Jour suivant", ariaMenu: "Changer de jour", 
            ariaMoisPrecedent: "Mois précédent", ariaMoisSuivant: "Mois suivant",
            ariaEvenement: "Événement :", ariaCreer: "Créer un événement le", chargement: "Chargement en cours",
            aideCreerEtendre: " (Shift plus flèches pour étendre)", aideCreerValider: " (Entrée pour valider)",
            aideDescendre: ". Alt plus bas pour sélectionner un événement",
            aideEventModif: " (Modification. Entrée pour valider, Échap pour annuler)",
            aideEventNormal: " (Majuscule plus flèches pour déplacer. Ctrl plus flèches pour fin. Ctrl plus Majuscule plus flèches pour début)",
            aideNavMois: ". Touches P et N pour changer de jour. Majuscule plus P et N pour changer de mois",
            ariaBloque: "Non disponible", ariaFermerMenu: "Fermer le menu", ariaLectureSeule: "Lecture seule",
            sansGroupe: "Autres événements", titreGroupes: "Thèmes", ariaMasquerGroupe: "Masquer", ariaAfficherGroupe: "Afficher",
            ariaSelectionEtendue: "Sélection étendue jusqu'au ", ariaEventDeplace: "Événement déplacé du ",
            ariaEventRedimensionne: "Événement redimensionné du ", ariaAu: " au ", ariaEventSpecial: "Événement spécial :"
        },
        'en': {
            aujourdhui: "Today", nouveau: "new", ajouter: "Add new", modifier: "Edit", supprimer: "Delete",
            ariaPrecedent: "Previous day", ariaSuivant: "Next day", ariaMenu: "Change day", 
            ariaMoisPrecedent: "Previous month", ariaMoisSuivant: "Next month",
            ariaEvenement: "Event:", ariaCreer: "Create event on", chargement: "Loading",
            aideCreerEtendre: " (Shift plus arrows to extend)", aideCreerValider: " (Enter to validate)",
            aideDescendre: ". Alt plus down to select an event",
            aideEventModif: " (Editing. Enter to validate, Escape to cancel)",
            aideEventNormal: " (Shift plus arrows to move. Ctrl plus arrows for end. Ctrl plus Shift plus arrows for start)",
            aideNavMois: ". P or N to change day. Add SHIFT to change month",
            ariaBloque: "Unavailable", ariaFermerMenu: "Close menu", ariaLectureSeule: "Read-only",
            sansGroupe: "Other events", titreGroupes: "Themes", ariaMasquerGroupe: "Hide", ariaAfficherGroupe: "Show",
            ariaSelectionEtendue: "Selection extended to ", ariaEventDeplace: "Event moved from ", 
            ariaEventRedimensionne: "Event resized from ", ariaAu: " to "
        },
        'es': { 
            aujourdhui: "Hoy", nouveau: "nuevo", ajouter: "Añadir", modifier: "Editar", supprimer: "Eliminar",
            ariaPrecedent: "Día anterior", ariaSuivant: "Día siguiente", ariaMenu: "Cambiar día", 
            ariaMoisPrecedent: "Mes anterior", ariaMoisSuivant: "Mes siguiente",
            ariaEvenement: "Evento:", ariaCreer: "Crear evento el", chargement: "Cargando",
            aideCreerEtendre: " (Mayús más flechas para extender)", aideCreerValider: " (Intro para validar)",
            aideDescendre: ". Alt más abajo para seleccionar un evento",
            aideEventModif: " (Modificación. Intro para validar, Escape para cancelar)",
            aideEventNormal: " (Mayús más flechas para mover. Ctrl más flechas para fin. Ctrl más Mayús más flechas para inicio)",
            aideNavMois: ". Teclas P y N para cambiar de día. Añade MAYÚS para cambiar de mes",
            ariaBloque: "No disponible", ariaFermerMenu: "Cerrar menú", ariaLectureSeule: "Solo lectura",
            sansGroupe: "Otros eventos", titreGroupes: "Temas", ariaMasquerGroupe: "Ocultar", ariaAfficherGroupe: "Mostrar",
            ariaSelectionEtendue: "Selección extendida hasta el ", 
            ariaEventDeplace: "Evento movido del ", ariaEventRedimensionne: "Evento redimensionado del ", ariaAu: " al "
        },
        'it': { 
            aujourdhui: "Oggi", nouveau: "nuovo", ajouter: "Aggiungi", modifier: "Modifica", supprimer: "Elimina",
            ariaPrecedent: "Giorno precedente", ariaSuivant: "Giorno successivo", ariaMenu: "Cambia giorno", 
            ariaMoisPrecedent: "Mese precedente", ariaMoisSuivant: "Mese successivo",
            ariaEvenement: "Evento:", ariaCreer: "Crea evento il", chargement: "Caricamento",
            aideCreerEtendre: " (Maiusc più frecce per estendere)", aideCreerValider: " (Invio per confermare)",
            aideDescendre: ". Alt più giù per selezionare un evento",
            aideEventModif: " (Modifica. Invio per confermare, Esc per annullare)",
            aideEventNormal: " (Maiusc più frecce per spostare. Ctrl più frecce per fine. Ctrl più Maiusc più frecce per inizio)",
            aideNavMois: ". Tasti P e N per cambiare giorno. Aggiungi MAIUSC per cambiare mese",
            ariaBloque: "Non disponibile", ariaFermerMenu: "Chiudi menu", ariaLectureSeule: "Sola lettura",
            sansGroupe: "Altri eventi", titreGroupes: "Temi", ariaMasquerGroupe: "Nascondi", ariaAfficherGroupe: "Mostra",
            ariaSelectionEtendue: "Selezione estesa fino al ", 
            ariaEventDeplace: "Evento spostato dal ", ariaEventRedimensionne: "Evento ridimensionato dal ", ariaAu: " al "
        },
        'de': { 
            aujourdhui: "Heute", nouveau: "neu", ajouter: "Hinzufügen", modifier: "Bearbeiten", supprimer: "Löschen",
            ariaPrecedent: "Vorheriger Tag", ariaSuivant: "Nächster Tag", ariaMenu: "Tag ändern", 
            ariaMoisPrecedent: "Vorheriger Monat", ariaMoisSuivant: "Nächster Monat",
            ariaEvenement: "Ereignis:", ariaCreer: "Ereignis erstellen am", chargement: "Wird geladen",
            aideCreerEtendre: " (Umschalt plus Pfeiltasten zum Erweitern)", aideCreerValider: " (Eingabe zum Bestätigen)",
            aideDescendre: ". Alt plus nach unten, um ein Ereignis auszuwählen",
            aideEventModif: " (Bearbeitung. Eingabe zum Bestätigen, Esc zum Abbrechen)",
            aideEventNormal: " (Umschalt plus Pfeiltasten zum Verschieben. Ctrl plus Pfeiltasten für Ende. Ctrl plus Umschalt plus Pfeiltasten für Start)",
            aideNavMois: ". Tasten P und N, um den Tag zu ändern. Umschalt hinzufügen, um den Monat zu ändern",
            ariaBloque: "Nicht verfügbar", ariaFermerMenu: "Menü schließen", ariaLectureSeule: "Schreibgeschützt",
            sansGroupe: "Andere Ereignisse", titreGroupes: "Themen", ariaMasquerGroupe: "Ausblenden", ariaAfficherGroupe: "Anzeigen",
            ariaSelectionEtendue: "Auswahl erweitert bis ", 
            ariaEventDeplace: "Ereignis verschoben vom ", ariaEventRedimensionne: "Ereignis in der Größe geändert vom ", ariaAu: " bis "
        },
        'pt': { 
            aujourdhui: "Hoje", nouveau: "novo", ajouter: "Adicionar", modifier: "Editar", supprimer: "Excluir",
            ariaPrecedent: "Dia anterior", ariaSuivant: "Dia seguinte", ariaMenu: "Mudar dia", 
            ariaMoisPrecedent: "Mês anterior", ariaMoisSuivant: "Mês seguinte",
            ariaEvenement: "Evento:", ariaCreer: "Criar evento em", chargement: "Carregando",
            aideCreerEtendre: " (Shift mais setas para estender)", aideCreerValider: " (Enter para validar)",
            aideDescendre: ". Alt mais para baixo para selecionar um evento",
            aideEventModif: " (Modificação. Enter para validar, Esc para cancelar)",
            aideEventNormal: " (Shift mais setas para mover. Ctrl mais setas para fim. Ctrl mais Shift mais setas para início)",
            aideNavMois: ". Teclas P e N para mudar de dia. Adicione SHIFT para mudar de mês",
            ariaBloque: "Indisponível", ariaFermerMenu: "Fechar menu", ariaLectureSeule: "Somente leitura",
            sansGroupe: "Outros eventos", titreGroupes: "Temas", ariaMasquerGroupe: "Ocultar", ariaAfficherGroupe: "Mostrar",
            ariaSelectionEtendue: "Seleção estendida até ", 
            ariaEventDeplace: "Evento movido de ", ariaEventRedimensionne: "Evento redimensionado de ", ariaAu: " para "
        }
    };

    protected dragCreationEnCours = signal(false);
    protected dateDebutCreation = signal<Date | null>(null);
    protected dateFinCreation = signal<Date | null>(null);
    protected zoneNavigationActive = signal<'left' | 'right' | null>(null);
    protected bulleSurvolee = signal<'left' | 'right' | null>(null);
    protected slotRetourFocus = signal<string | null>(null);
    protected messageAriaLive = signal<string>('');

    constructor() 
    {
        effect(() => {
            if (this.langue) this.dateAdapter.setLocale(this.langue());
        });
    }

    protected trad = computed(() => 
    {
        const codeLangue = this.langue().substring(0, 2).toLowerCase();
        return this.DICT_TRADUCTION[codeLangue] || this.DICT_TRADUCTION['en'];
    });

    protected listeEvenementGroupe = computed(() => 
    {
        const tousLesEvents = this.events() || [];
        const tousLesGroupes = this.groups() || [];
        const resultat: { groupe: any | null, events: EventCalandar[] }[] = [];

        tousLesGroupes.forEach(g => {
            const evs = tousLesEvents.filter(e => e.groupEventId == g.id);
            if (evs.length > 0) resultat.push({ groupe: g, events: evs });
        });

        const sansGroupe = tousLesEvents.filter(e => !e.groupEventId);
        if (sansGroupe.length > 0) resultat.push({ groupe: null, events: sansGroupe });

        return resultat;
    });

    protected displayEvents = computed(() => 
    {
        const preview = this.previewResize();
        const baseEvents = this.events() ?? [];
        const masques = this.groupesMasques();
        const bloquerPasse = this.readonlyPast();
        const maintenant = this.heureActuelle().getTime();

        const eventsFiltres = baseEvents.filter(ev => {
            const idGroupe = ev.groupEventId || 'sans-groupe';
            return !masques.has(idGroupe);
        }).map(ev => {
            if (bloquerPasse && ev.startDate.getTime() < maintenant)
                return { ...ev, readonly: true };
            return ev;
        });

        if (!preview) return eventsFiltres;

        return eventsFiltres.map(ev => 
            ev.id == preview.eventId ? { ...ev, startDate: preview.startDate, endDate: preview.endDate } : ev
        );
    });

    protected titrePeriode = computed(() => {
        const format = new Intl.DateTimeFormat(this.langue(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return format.format(this.dateReference());
    });

    protected jourActuel = computed(() => 
    {
        const DATE = this.dateReference();
        const M = DATE.getMonth() + 1;
        const D = DATE.getDate();

        const eventsSpeciauxDuJour = this.specialEvents().filter(sp => 
        {
            const startM = sp.dateStart.month; const startD = sp.dateStart.day;
            const endM = sp.dateEnd.month; const endD = sp.dateEnd.day;
            const isNormalInterval = (startM < endM) || (startM === endM && startD <= endD);

            if (isNormalInterval) 
                return (M > startM || (M === startM && D >= startD)) && (M < endM || (M === endM && D <= endD));

            else 
                return (M > startM || (M === startM && D >= startD)) || (M < endM || (M === endM && D <= endD));
        });

        return {
            date: DATE,
            estAujourdhui: this.EstAujourdhui(DATE),
            estBloquer: this.EstBloque(DATE),
            reduit: DATE.toLocaleString(this.langue(), { weekday: 'short' }).replace('.', ''),
            normal: DATE.toLocaleString(this.langue(), { weekday: 'long' }),
            specialEvents: eventsSpeciauxDuJour
        };
    });

    protected positionBarreRouge = computed(() => {
        const maintenant = this.heureActuelle();
        const h = maintenant.getHours();
        const m = maintenant.getMinutes();
        const min = this.hourMin();
        if (h < min || h > this.hourMax()) return -100;
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

            let periode = heureIndex >= 12 ? 'PM' : 'AM';
            let heure = heureIndex % 12 || 12;

            return `${heure} ${periode}`;
        });
    });

    protected formatHeureCreation = computed(() => {
        let debut = this.dateDebutCreation();
        let fin = this.dateFinCreation();
        return !debut || !fin ? "" : this.GenererFormatHeure(debut, fin, this.useAmPm());
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
        if(this.sidebarConfig()?.defaultOpen === true) 
            this.panneauOuvert.set(true);

        this.OnResize();
        this.timerInterval = setInterval(() => { this.heureActuelle.set(new Date()); }, 60_000);
        this.VerifierTheme();
        this.themeObserver = new MutationObserver(() => this.VerifierTheme());
        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    ngOnDestroy(): void 
    {
        if (this.timerInterval) 
            clearInterval(this.timerInterval);

        if (this.themeObserver) 
            this.themeObserver.disconnect();
    }

    protected dateFilter = (date: Date | null): boolean => 
    {
        if (!date) 
            return true;

        return !this.EstBloque(date);
    };

    protected GetDayHeaderAriaLabel(element: any): string 
    {
        let label = element.estAujourdhui ? this.trad().aujourdhui + ', ' : '';
        label += element.normal;

        if (element.specialEvents && element.specialEvents.length > 0) 
        {
            const titres = element.specialEvents.map((sp: any) => sp.title).join(', ');
            label += ', ' + this.trad().ariaEventSpecial + ' ' + titres;
        }

        return label;
    }

    protected GetSlotAriaLabel(dateJour: Date, h: string, aDesEvents: boolean): string {
        if (this.EstJourPasse(dateJour, h))
            return this.FormatDateAria(dateJour) + ' ' + h + ', ' + this.trad().ariaBloque;

        let label = this.EstAujourdhui(dateJour) ? this.trad().aujourdhui + ', ' : '';
        label += this.FormatDateAria(dateJour) + ' ' + h;
        
        if (!this.dragCreationEnCours()) 
            label += '. ' + this.trad().ariaCreer + ' ' + this.FormatDateAria(dateJour) + ' ' + h + this.trad().aideCreerEtendre + (aDesEvents ? this.trad().aideDescendre : '') + this.trad().aideNavMois;
        else
            label += '. ' + this.trad().aideCreerValider;

        return label;
    }

    protected GetEventAriaLabel(ev: PositionedEvent): string 
    {
        let label = this.trad().ariaEvenement + ' ' + ev.titre + ' ' + this.FormatDateAria(ev.startDate) + ' ' + ev.formatHeure;
        if (this.readonly() || ev.readonly) 
            label += ', ' + this.trad().ariaLectureSeule;

        else if (this.previewResize()?.eventId === ev.id) 
            label += this.trad().aideEventModif;

        else 
            label += this.trad().aideEventNormal;
        
        label += this.trad().aideNavMois;
        return label;
    }

    protected AnnoncerActionVocalement(message: string): void 
    {
        this.messageAriaLive.set('');
        setTimeout(() => this.messageAriaLive.set(message), 50);
    }

    protected EstBloque(date: Date): boolean 
    {
        if (!date) 
            return false;
        
        const dayOfWeek = date.getDay();
        const month = date.getMonth() + 1;

        if (this.joursAExclure().includes(dayOfWeek)) 
            return true;

        if (this.monthsDisabled().includes(month)) 
            return true;

        if (this.daysDisabled()?.some(d => this.EstMemeJour(d, date))) 
            return true;

        return false;
    }

    protected OnDateSelectionnee(event: any): void 
    {
        if (event.value) 
            this.dateReference.set(event.value);
    }

    protected EstAujourdhui(_date: Date): boolean
    {
        const DATE = new Date();
        return _date.getDate() == DATE.getDate() && 
            _date.getMonth() == DATE.getMonth() && 
            _date.getFullYear() == DATE.getFullYear();
    }

    protected EstJourPasse(jourDate: Date, heureLabel: string): boolean 
    {
        if (!this.readonlyPast()) 
            return false;

        let heures = parseInt(heureLabel, 10);
        if (this.useAmPm()) 
        {
            const estPM = heureLabel.toLowerCase().includes('pm');
            if (estPM && heures < 12) 
                heures += 12;

            if (!estPM && heures == 12) 
                heures = 0;
        }
        const finSlot = new Date(jourDate.getFullYear(), jourDate.getMonth(), jourDate.getDate(), heures + 1, 0, 0).getTime();
        return finSlot <= this.heureActuelle().getTime();
    }

    protected BasculerVisibiliteGroupe(idGroupe: string | number | null): void 
    {
        const actuel = new Set(this.groupesMasques());
        const idABasculer = idGroupe === null ? 'sans-groupe' : idGroupe;
        if (actuel.has(idABasculer)) 
            actuel.delete(idABasculer);

        else 
            actuel.add(idABasculer);

        this.groupesMasques.set(actuel);
    }

    protected EstGroupeMasque(idGroupe: string | number | null): boolean 
    {
        const idAVerifier = idGroupe === null ? 'sans-groupe' : idGroupe;
        return this.groupesMasques().has(idAVerifier);
    }

    protected FormaterDateCourte(date: Date): string 
    { 
        if (!date) 
            return '';

        return new Intl.DateTimeFormat(this.langue(), { day: '2-digit', month: 'short' }).format(date);
    }

    private EstDansIntervalle(_dateAChecker: Date, _debut: Date, _fin: Date): boolean 
    {
        const DATE = new Date(_dateAChecker.getFullYear(), _dateAChecker.getMonth(), _dateAChecker.getDate()).getTime();
        const DEBUT = new Date(_debut.getFullYear(), _debut.getMonth(), _debut.getDate()).getTime();
        const FIN = new Date(_fin.getFullYear(), _fin.getMonth(), _fin.getDate()).getTime();

        return DATE >= DEBUT && DATE <= FIN;
    }

    protected OnContextMenuAction(_action: string, _event: EventCalandar): void 
    { 
        this.contextClicked.emit({
            action: _action,
            event: { ..._event }
        });
    }

    protected ClickEvent(_event: EventCalandar): void 
    {   
        this.eventClicked.emit({
            id: _event.id,
            readonly: _event.readonly,
            groupEventId: _event.groupEventId,
            startDate: _event.startDate,
            endDate: _event.endDate,
            titre: _event.titre,
            description: _event.description
        });
    }

    protected BtnAjouterClicker(): void 
    {
        this.btnAddClicked.emit();
    }

    protected ClickJour(_date: Date): void 
    {
        let liste = this.events().filter(x => this.EstDansIntervalle(_date, x.startDate, x.endDate));
        this.dayClicked.emit(liste);
    }

    protected getPositionedEvents(dateJour: Date): PositionedEvent[] 
    {
        const LISTE_EVENT = this.displayEvents().filter(x => this.EstDansIntervalle(dateJour, x.startDate, x.endDate))
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || b.endDate.getTime() - a.endDate.getTime());

        if (LISTE_EVENT.length == 0) 
            return [];

        const positionedEvents: any[] = [];
        let groupeActuelle: any[] = [];
        let maxTimestampFin = 0;

        LISTE_EVENT.forEach(event => 
        {
            if (event.startDate.getTime() >= maxTimestampFin) 
            {
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

        let styles: any = {
            'top.px': Math.max(0, top),
            'height.px': Math.min(maxGrid, endTotal) - Math.max(0, top),
            'min-height.px': 15,
            'display': 'flex'
        };

        if (event.groupEventId) 
        {
            const group = this.groups().find(g => g.id == event.groupEventId);
            if (group) 
            {
                if (this.isDarkModeActive()) 
                {
                    styles['--event-bg'] = group.bgColorDark || group.bgColorLight;
                    styles['--event-text'] = group.textColorDark || group.textColorLight;
                } 
                else 
                {
                    styles['--event-bg'] = group.bgColorLight;
                    styles['--event-text'] = group.textColorLight;
                }
            }
        }
        
        return styles;
    }

    protected AllerAujourdhui(): void 
    { 
        this.dateReference.set(new Date()); 
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
        this.dateReference.set(this.TrouverJourValide(DATE, -1));
    }

    protected MoisSuivant(): void 
    {
        const DATE = new Date(this.dateReference());
        DATE.setMonth(DATE.getMonth() + 1);
        this.dateReference.set(this.TrouverJourValide(DATE, 1));
    }

    protected Precedent(): void 
    {
        const DATE = new Date(this.dateReference());
        DATE.setDate(DATE.getDate() - 1);
        this.dateReference.set(this.TrouverJourValide(DATE, -1));
    }

    protected Suivant(): void 
    {
        const DATE = new Date(this.dateReference());
        DATE.setDate(DATE.getDate() + 1);
        this.dateReference.set(this.TrouverJourValide(DATE, 1));
    }

    protected styleApercuCreation(colDate: Date): any 
    {
        if (!this.dragCreationEnCours()) 
            return null;
        
        const debut = this.dateDebutCreation();
        const fin = this.dateFinCreation();

        if (!debut || !fin) 
            return null;

        const tCol = new Date(colDate.getFullYear(), colDate.getMonth(), colDate.getDate()).getTime();
        const dMin = new Date(Math.min(debut.getTime(), fin.getTime()));
        const dMax = new Date(Math.max(debut.getTime(), fin.getTime()));

        const tMin = new Date(dMin.getFullYear(), dMin.getMonth(), dMin.getDate()).getTime();
        const tMax = new Date(dMax.getFullYear(), dMax.getMonth(), dMax.getDate()).getTime();

        if (tCol < tMin || tCol > tMax) 
            return null;

        const minH = this.hourMin();
        const maxH = this.hourMax();

        let hDeb = (tCol === tMin) ? dMin.getHours() : minH;
        let mDeb = (tCol === tMin) ? dMin.getMinutes() : 0;
        
        let hFin = (tCol === tMax) ? dMax.getHours() : maxH + 1;
        let mFin = (tCol === tMax) ? dMax.getMinutes() : 0;

        let top = ((hDeb - minH) * 60) + mDeb;
        let endTotal = ((hFin - minH) * 60) + mFin;
        const maxGrid = (maxH - minH + 1) * 60;

        return {
            'top.px': Math.max(0, top),
            'height.px': Math.min(maxGrid, endTotal) - Math.max(0, top),
            'display': 'flex'
        };
    }

    protected OnEventKeydown(event: KeyboardEvent, ev: PositionedEvent): void 
    {
        if (event.key == 'Escape') 
        {
            if (this.previewResize()) 
            {
                this.previewResize.set(null);
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }

        // Navigation Rapide (P et N)
        if (['p', 'n'].includes(event.key.toLowerCase()) && !event.ctrlKey && !event.metaKey && !event.altKey) 
        {
            event.preventDefault();
            event.stopPropagation();
            
            const recule = event.key.toLowerCase() === 'p';
            
            if (event.shiftKey) 
            {
                if (recule) this.MoisPrecedent();
                else this.MoisSuivant();
            } 
            else 
            {
                if (recule) this.Precedent();
                else this.Suivant();
            }

            setTimeout(() => {
                const e = this.el.nativeElement.querySelector(`#event-${ev.id}`) as HTMLElement;
                if (e) 
                    e.focus(); 
                else 
                {
                    const fallbackSlot = this.el.nativeElement.querySelector('.hour-slot') as HTMLElement;
                    if (fallbackSlot) 
                        fallbackSlot.focus();
                }
            }, 120);

            return;
        }

        // 2. Valider / Ouvrir
        if (event.key == 'Enter' || event.key == ' ') 
        {
            event.preventDefault();
            event.stopPropagation();
            const apercu = this.previewResize();
            
            if (apercu && apercu.eventId == ev.id) 
            {
                this.eventUpdated.emit({
                    id: ev.id,
                    titre: ev.titre,
                    description: ev.description,
                    groupEventId: ev.groupEventId,
                    readonly: ev.readonly,
                    startDate: apercu.startDate,
                    endDate: apercu.endDate
                });
                this.previewResize.set(null);
            }
            else 
                this.ClickEvent(ev);

            return;
        }

        // Remonter sur le créneau horaire (Alt + Flèche Haut)
        if (event.altKey && event.key === 'ArrowUp') 
        {
            event.preventDefault();
            const idTarget = this.slotRetourFocus() || (new Date(ev.startDate.getFullYear(), ev.startDate.getMonth(), ev.startDate.getDate()).getTime() + '-' + this.heures()[0].replace(/\s+/g, ''));
            const slotEl = this.el.nativeElement.querySelector(`#slot-${idTarget}`) as HTMLElement;

            if (slotEl) 
                slotEl.focus();
            return;
        }
        
        // Navigation TAB intelligente
        if (event.key === 'Tab') 
        {
            const cible = event.target as HTMLElement;
            const column = cible.closest('.day-column');
            if (column) 
            {
                const tousEvents = Array.from(column.querySelectorAll('.event-block')) as HTMLElement[];
                const idx = tousEvents.indexOf(cible);
                
                if (!event.shiftKey && idx === tousEvents.length - 1) 
                {
                    event.preventDefault(); 
                    const idTarget = this.slotRetourFocus() || (new Date(ev.startDate.getFullYear(), ev.startDate.getMonth(), ev.startDate.getDate()).getTime() + '-' + this.heures()[0].replace(/\s+/g, ''));
                    const slotEl = this.el.nativeElement.querySelector(`#slot-${idTarget}`) as HTMLElement;

                    if (slotEl) 
                        slotEl.focus();
                }
                else if (event.shiftKey && idx === 0) 
                {
                    event.preventDefault();
                    const idTarget = this.slotRetourFocus() || (new Date(ev.startDate.getFullYear(), ev.startDate.getMonth(), ev.startDate.getDate()).getTime() + '-' + this.heures()[0].replace(/\s+/g, ''));
                    const slotEl = this.el.nativeElement.querySelector(`#slot-${idTarget}`) as HTMLElement;

                    if (slotEl) 
                        slotEl.focus();
                }
            }

            return;
        }

        // Déplacement et Redimensionnement au clavier
        let estEnDeplacement = event.shiftKey && !event.ctrlKey && !event.metaKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
        let estResizingFin = (event.ctrlKey || event.metaKey) && !event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
        let estResizingDebut = (event.ctrlKey || event.metaKey) && event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);

        if (estEnDeplacement || estResizingFin || estResizingDebut) 
        {
            event.preventDefault();
            event.stopPropagation();
            if (this.readonly() || ev.readonly) 
                return;

            this.ignoreBlur = true;
            if (this.focusTimeout) 
                clearTimeout(this.focusTimeout);

            const apercu = this.previewResize();
            let newStart = new Date(apercu && apercu.eventId === ev.id ? apercu.startDate : ev.startDate);
            let newEnd = new Date(apercu && apercu.eventId === ev.id ? apercu.endDate : ev.endDate);

            let decMinutes = 0;
            let decJours = 0;
            if (event.key === 'ArrowRight') 
                decJours = 1;

            else if (event.key === 'ArrowLeft') 
                decJours = -1;

            else if (event.key === 'ArrowDown') 
                decMinutes = 15;

            else if (event.key === 'ArrowUp') 
                decMinutes = -15;

            if (estEnDeplacement) 
            {
                newStart.setDate(newStart.getDate() + decJours);
                newStart.setMinutes(newStart.getMinutes() + decMinutes);
                newEnd.setDate(newEnd.getDate() + decJours);
                newEnd.setMinutes(newEnd.getMinutes() + decMinutes);
            } 
            else if (estResizingFin) 
            {
                let testEnd = new Date(newEnd);
                testEnd.setDate(testEnd.getDate() + decJours);
                testEnd.setMinutes(testEnd.getMinutes() + decMinutes);
                
                if (testEnd.getTime() > newStart.getTime()) 
                    newEnd = testEnd;
            }
            else if (estResizingDebut) 
            {
                let testStart = new Date(newStart);
                testStart.setDate(testStart.getDate() + decJours);
                testStart.setMinutes(testStart.getMinutes() + decMinutes);
                
                if (testStart.getTime() < newEnd.getTime()) 
                    newStart = testStart;
            }

            this.previewResize.set({ eventId: ev.id, startDate: newStart, endDate: newEnd });

            const typeAction = estEnDeplacement ? this.trad().ariaEventDeplace : this.trad().ariaEventRedimensionne;
            this.AnnoncerActionVocalement(`${typeAction}${this.FormatDateAria(newStart)} ${newStart.getHours()}h ${this.trad().ariaAu} ${this.FormatDateAria(newEnd)} ${newEnd.getHours()}h`);
            
            let referenceDate: Date;
            if (estResizingDebut) 
                referenceDate = newStart;

            else if (estResizingFin) 
                referenceDate = newEnd;

            else 
                referenceDate = decJours < 0 ? newStart : newEnd; 

            let aTournePage = false;
            
            // Calcul des limites strictes de la journée en cours
            const debutJour = new Date(this.dateReference());
            debutJour.setHours(0, 0, 0, 0);
            
            const finJour = new Date(this.dateReference());
            finJour.setHours(23, 59, 59, 999);

            if (referenceDate.getTime() < debutJour.getTime()) 
            { 
                this.Precedent();
                aTournePage = true; 
            }
            else if (referenceDate.getTime() > finJour.getTime()) 
            { 
                this.Suivant();
                aTournePage = true; 
            }

            this.focusTimeout = setTimeout(() => 
            {
                const elementsEvenement = this.el.nativeElement.querySelectorAll(`#event-${ev.id}`);
                
                if (elementsEvenement.length > 0)
                {
                    if (estResizingFin || (estEnDeplacement && decJours > 0))
                        (elementsEvenement[elementsEvenement.length - 1] as HTMLElement).focus();
                    else
                        (elementsEvenement[0] as HTMLElement).focus();
                }
                
                this.ignoreBlur = false;
                
            }, aTournePage ? 120 : 30);
        }
    }

    protected OnMouseDownHoraire(dateJour: Date, event: MouseEvent | TouchEvent | Event): void 
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
        const clientYDebut = event instanceof MouseEvent ? event.clientY : (event as TouchEvent).touches[0].clientY;
        const clientXDebut = event instanceof MouseEvent ? event.clientX : (event as TouchEvent).touches[0].clientX;
        
        let yActuel = clientYDebut - initialRect.top;
        if (yActuel < 0) 
            yActuel = 0;

        // DATE D'ANCRAGE : On mémorise la case exacte où l'utilisateur a cliqué
        let minutesCliquees = Math.floor(yActuel / 15) * 15;
        const minutesTotales = (this.hourMin() * 60) + minutesCliquees;
        const heure = Math.floor(minutesTotales / 60);
        const minute = minutesTotales % 60;

        let dateComplete = new Date(dateJour);
        dateComplete.setHours(heure, minute, 0, 0);
        const timestampAncrage = dateComplete.getTime();

        if (this.readonlyPast() && timestampAncrage < this.heureActuelle().getTime())
            return;

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
            if (intentionScroll) 
                return;

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
                if (aBouge) 
                    this.dragCreationEnCours.set(true);

                if (_moveEvent.cancelable) 
                    _moveEvent.preventDefault();

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
                    let timestampSurvole = dateSurvolee.getTime();

                    if (this.readonlyPast() && timestampSurvole < this.heureActuelle().getTime())
                        timestampSurvole = this.heureActuelle().getTime();

                    // Compare la case survolée avec la toute première case cliquée (ancrage)
                    if (timestampSurvole < timestampAncrage) 
                    {
                        this.dateDebutCreation.set(new Date(timestampSurvole));
                        this.dateFinCreation.set(new Date(timestampAncrage + 15 * 60 * 1000));
                    } 
                    else 
                    {
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

            if (window.getSelection) 
                window.getSelection()?.removeAllRanges();

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

    protected OnTimeSlotKeydown(event: KeyboardEvent, dateJour: Date, heureLabel: string, eventsDuJour: PositionedEvent[] = []): void 
    {
        const idSlot = dateJour.getTime() + '-' + heureLabel.replace(/\s+/g, '');

        if (event.key === 'Escape') 
        {
            if (this.dragCreationEnCours()) {
                this.AnnulerCreationClavier();
                event.preventDefault();
            }
            return;
        }

        // Navigation Rapide (Jour / Mois)
        if (['p', 'n'].includes(event.key.toLowerCase()) && !event.ctrlKey && !event.metaKey && !event.altKey) 
        {
            event.preventDefault();
            
            const recule = event.key.toLowerCase() == 'p';
            
            if (event.shiftKey) 
            {
                if (recule) 
                    this.MoisPrecedent();
                else
                    this.MoisSuivant();
            } 
            else 
            {
                if (recule) 
                    this.Precedent();
                else 
                    this.Suivant();
            }

            let nouvelleDate = new Date(dateJour);
            if (event.shiftKey)
                nouvelleDate.setMonth(nouvelleDate.getMonth() + (recule ? -1 : 1));
            else
                nouvelleDate.setDate(nouvelleDate.getDate() + (recule ? -1 : 1));

            let strHour = heureLabel.replace(/\s+/g, '');

            setTimeout(() => 
            {
                const targetId = nouvelleDate.getTime() + '-' + strHour;
                const caseSlot = this.el.nativeElement.querySelector(`#slot-${targetId}`) as HTMLElement;
                
                if (caseSlot) 
                    caseSlot.focus();
                else 
                {
                    const fallbackSlot = this.el.nativeElement.querySelector('.hour-slot') as HTMLElement;
                    if (fallbackSlot) 
                        fallbackSlot.focus();
                }
            }, 120);

            return;
        }

        // Naviguer dans les événements (Alt + Bas)
        if (event.altKey && event.key === 'ArrowDown') 
        {
            event.preventDefault();
            if (eventsDuJour && eventsDuJour.length > 0) 
            {
                this.slotRetourFocus.set(idSlot);
                const eventElement = this.el.nativeElement.querySelector(`#event-${eventsDuJour[0].id}`) as HTMLElement;

                if (eventElement) 
                    eventElement.focus();
            }

            return;
        }

        // Valider ou Ouvrir
        if (event.key === 'Enter' || event.key === ' ') 
        {
            event.preventDefault();
            if (this.readonly() || this.EstJourPasse(dateJour, heureLabel)) return;

            if (this.dragCreationEnCours()) 
            {
                const debut = this.dateDebutCreation();
                const fin = this.dateFinCreation();

                if (debut && fin) 
                {   
                    this.eventCreated.emit({ 
                        start: new Date(Math.min(debut.getTime(), fin.getTime())), 
                        end: new Date(Math.max(debut.getTime(), fin.getTime()))
                    });
                }

                this.AnnulerCreationClavier();
            } 
            else
                this.ClickTimeSlot(dateJour, heureLabel);

            return;
        }

        // Déplacement simple au clavier sur les créneaux horaires
        if (!event.shiftKey && !event.ctrlKey && !event.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) 
        {
            event.preventDefault();
            
            let nouvelleDate = new Date(dateJour);
            let heureActuelleIndex = this.heures().indexOf(heureLabel);
            let nouvelleHeureLabel = heureLabel;

            if (event.key == 'ArrowRight') 
                nouvelleDate.setDate(nouvelleDate.getDate() + 1);

            else if (event.key == 'ArrowLeft') 
                nouvelleDate.setDate(nouvelleDate.getDate() - 1);

            else if (event.key == 'ArrowDown') 
            {
                if (heureActuelleIndex < this.heures().length - 1) 
                    nouvelleHeureLabel = this.heures()[heureActuelleIndex + 1];
            } 
            else if (event.key == 'ArrowUp') 
            {
                if (heureActuelleIndex > 0) 
                    nouvelleHeureLabel = this.heures()[heureActuelleIndex - 1];
            }

            const tNouvelleDate = new Date(nouvelleDate.getFullYear(), nouvelleDate.getMonth(), nouvelleDate.getDate()).getTime();
            const tJourActuel = new Date(this.dateReference().getFullYear(), this.dateReference().getMonth(), this.dateReference().getDate()).getTime();

            let aTournePage = false;
            if (tNouvelleDate < tJourActuel) 
            { 
                this.Precedent(); 
                aTournePage = true; 
            } 
            else if (tNouvelleDate > tJourActuel) 
            { 
                this.Suivant(); 
                aTournePage = true; 
            }

            setTimeout(() => 
            {
                const idCible = nouvelleDate.getTime() + '-' + nouvelleHeureLabel.replace(/\s+/g, '');
                const caseSlot = this.el.nativeElement.querySelector(`#slot-${idCible}`) as HTMLElement;

                if (caseSlot) 
                    caseSlot.focus();
            }, aTournePage ? 120 : 10);

            return;
        }

        // Création d'événement au clavier (Shift + Flèches)
        if (event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) 
        {
            event.preventDefault();
            if (this.readonly()) 
                return;

            this.ignoreBlur = true;
            if (this.focusTimeout) 
                clearTimeout(this.focusTimeout);

            if (!this.dragCreationEnCours()) 
            {
                if (this.EstJourPasse(dateJour, heureLabel)) 
                    return;

                let heures = parseInt(heureLabel, 10);
                if (this.useAmPm()) 
                {
                    const estPM = heureLabel.toLowerCase().includes('pm');
                    if (estPM && heures < 12) 
                        heures += 12;

                    if (!estPM && heures === 12) 
                        heures = 0;
                }
                
                let dateDebut = new Date(dateJour);
                dateDebut.setHours(heures, 0, 0, 0);
                
                // +15 min
                let dateFin = new Date(dateDebut.getTime() + 15 * 60000); 

                this.dragCreationEnCours.set(true);
                this.dateDebutCreation.set(dateDebut);
                this.dateFinCreation.set(dateFin);
            }

            let decMinutes = 0;
            let decJours = 0;
            if (event.key === 'ArrowRight') 
                decJours = 1;

            else if (event.key === 'ArrowLeft') 
                decJours = -1;

            else if (event.key === 'ArrowDown') 
                decMinutes = 15;

            else if (event.key === 'ArrowUp') 
                decMinutes = -15;

            const dateActuelleFin = this.dateFinCreation()!;
            const nouvelleDateFin = new Date(dateActuelleFin);
            nouvelleDateFin.setDate(nouvelleDateFin.getDate() + decJours);
            nouvelleDateFin.setMinutes(nouvelleDateFin.getMinutes() + decMinutes);

            this.dateFinCreation.set(nouvelleDateFin);

            let targetSlotDate = new Date(dateJour);
            targetSlotDate.setDate(targetSlotDate.getDate() + decJours);

            const tCible = new Date(targetSlotDate.getFullYear(), targetSlotDate.getMonth(), targetSlotDate.getDate()).getTime();
            const tJourActuel = new Date(this.dateReference().getFullYear(), this.dateReference().getMonth(), this.dateReference().getDate()).getTime();

            let aTournePage = false;
            if (tCible < tJourActuel) 
            { 
                this.Precedent(); 
                aTournePage = true; 
            }
            else if (tCible > tJourActuel) 
            { 
                this.Suivant(); 
                aTournePage = true; 
            }

            let hCible = nouvelleDateFin.getHours();
            let heureString = "";
            
            if (this.useAmPm()) 
            {
                const period = hCible >= 12 ? "PM" : "AM";
                const displayHour = hCible % 12 || 12;
                heureString = `${displayHour} ${period}`;
            } 
            else
                heureString = `${hCible}h`;

            this.AnnoncerActionVocalement(this.trad().ariaSelectionEtendue + this.FormatDateAria(nouvelleDateFin) + ' - ' + heureString);

            this.focusTimeout = setTimeout(() => 
            {
                const idCible = targetSlotDate.getTime() + "-" + heureString.replace(/\s+/g, "");
                const slot = this.el.nativeElement.querySelector(`#slot-${idCible}`) as HTMLElement;
                
                if (slot) 
                    slot.focus();
                
                this.ignoreBlur = false; 

            }, aTournePage ? 120 : 30);
        }
    }

    protected OnMoveStart(_e: MouseEvent | TouchEvent, ev: PositionedEvent): void 
    {
        if (this.readonly() || ev.readonly) 
            return;

        if (_e instanceof MouseEvent && _e.button !== 0) 
            return; 

        _e.preventDefault();
        _e.stopPropagation();

        let clientXDebut = _e instanceof MouseEvent ? _e.clientX : _e.touches[0].clientX;
        let clientYDebut = _e instanceof MouseEvent ? _e.clientY : _e.touches[0].clientY;

        // On détecte la colonne d'origine
        let elementsDebut = document.elementsFromPoint(clientXDebut, clientYDebut);
        let colOrigine = elementsDebut.find(el => el.classList.contains('day-column')) as HTMLElement | undefined;

        if (!colOrigine || !colOrigine.dataset['date']) 
            return;

        const colRectDebut = colOrigine.getBoundingClientRect();
        let yDebutStr = clientYDebut - colRectDebut.top;
        if (yDebutStr < 0) 
            yDebutStr = 0;

        let minsDebut = Math.floor(yDebutStr / 15) * 15;
        let tMinsDebut = (this.hourMin() * 60) + minsDebut;

        let dateOrigine = new Date(parseInt(colOrigine.dataset['date'], 10));
        dateOrigine.setHours(Math.floor(tMinsDebut / 60), tMinsDebut % 60, 0, 0);

        let aBouge = false;
        let dateTrouvee = false;
        let finalStartDate = new Date(ev.startDate);
        let finalEndDate = new Date(ev.endDate);

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => 
        {
            if (_moveEvent.cancelable) 
                _moveEvent.preventDefault();

            let clientX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;
            let clientY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;

            if (!aBouge && (Math.abs(clientX - clientXDebut) > 5 || Math.abs(clientY - clientYDebut) > 5)) 
                aBouge = true;

            if (aBouge) 
            {
                this.pointerX = clientX;
                this.pointerY = clientY;
                this.DemarrerAutoScrollContinu();
                this.GererNavigationBulle(clientX, clientY);

                const elementsSurvoles = document.elementsFromPoint(clientX, clientY);
                let hoveredCol = elementsSurvoles.find(el => el.classList.contains('day-column')) as HTMLElement | undefined;

                if (hoveredCol && hoveredCol.dataset['date']) 
                {
                    const colTimestamp = parseInt(hoveredCol.dataset['date'], 10);
                    const colRect = hoveredCol.getBoundingClientRect();
                    
                    let yActuel = clientY - colRect.top;
                    if (yActuel < 0) 
                        yActuel = 0;
                    
                    let minutesSurvolees = Math.floor(yActuel / 15) * 15;
                    const totalMins = (this.hourMin() * 60) + minutesSurvolees;
                    
                    let dateSurvolee = new Date(colTimestamp);
                    dateSurvolee.setHours(Math.floor(totalMins / 60), totalMins % 60, 0, 0);

                    const diffMs = dateSurvolee.getTime() - dateOrigine.getTime();
                    let nouvelleDateDebut = new Date(ev.startDate.getTime() + diffMs);
                    let nouvelleDateFin = new Date(ev.endDate.getTime() + diffMs);

                    if (this.readonlyPast() && nouvelleDateDebut.getTime() < this.heureActuelle().getTime()) 
                        return;

                    finalStartDate = nouvelleDateDebut;
                    finalEndDate = nouvelleDateFin;
                    dateTrouvee = true;

                    this.previewResize.set({
                        eventId: ev.id,
                        startDate: finalStartDate,
                        endDate: finalEndDate
                    });
                }
            }
        };

        const onMouseUp = () => 
        {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);

            if (window.getSelection) 
                window.getSelection()?.removeAllRanges();

            this.previewResize.set(null);
            this.NettoyerNavigationBulle();
            this.ArreterAutoScroll();

            if (aBouge && dateTrouvee && (finalStartDate.getTime() != ev.startDate.getTime() || finalEndDate.getTime() != ev.endDate.getTime())) 
            {
                this.eventUpdated.emit({
                    id: ev.id,
                    titre: ev.titre,
                    description: ev.description,
                    groupEventId: ev.groupEventId,
                    readonly: ev.readonly,
                    startDate: finalStartDate,
                    endDate: finalEndDate
                });
            }
            else if (!aBouge) 
                this.ClickEvent(ev);
        };

        window.addEventListener('mousemove', onMouseMove, { passive: false });
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onMouseMove, { passive: false });
        window.addEventListener('touchend', onMouseUp);
    }

    protected InitialiserResize(mouseEvent: MouseEvent | TouchEvent, ev: PositionedEvent, direction: 'top' | 'bottom'): void 
    {
        if (this.readonly() || ev.readonly) 
            return;

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
            const elementsSurvoles = document.elementsFromPoint(clientX, clientY);
            const hoveredCol = elementsSurvoles.find(el => el.classList.contains('day-column')) as HTMLElement | undefined;

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

                if (this.readonlyPast() && hoveredDate.getTime() < this.heureActuelle().getTime())
                    hoveredDate = new Date(this.heureActuelle().getTime());

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

            if (window.getSelection) 
                window.getSelection()?.removeAllRanges();

            this.previewResize.set(null);
            this.NettoyerNavigationBulle();
            this.ArreterAutoScroll();

            if (newStart.getTime() !== ev.startDate.getTime() || newEnd.getTime() !== ev.endDate.getTime()) 
            {
                this.eventUpdated.emit({ 
                    id: ev.id,
                    titre: ev.titre,
                    description: ev.description,
                    groupEventId: ev.groupEventId,
                    readonly: ev.readonly,
                    startDate: newStart,
                    endDate: newEnd
                });
            }
        };

        window.addEventListener('mousemove', onMouseMove, { passive: false });
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

    protected FormatDateAria(date: Date): string {
        if (!date) return '';
        const langue = this.langue() || 'fr-FR'; 
        return date.toLocaleDateString(langue, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    protected OnEventBlur(ev: PositionedEvent): void 
    {
        if (this.ignoreBlur) 
            return;

        const preview = this.previewResize();
        if (preview && preview.eventId === ev.id) 
            this.previewResize.set(null);
    }

    private TrouverJourValide(dateDepart: Date, direction: 1 | -1): Date 
    {
        let d = new Date(dateDepart);
        let safety = 0;

        while (this.EstBloque(d) && safety < 366) 
        {
            d.setDate(d.getDate() + direction);
            safety++;
        }

        return d;
    }

    private VerifierTheme(): void 
    {
        const config = this.themeConfig();
        const classDark = config?.darkModeClass || '';
        const classLight = config?.lightModeClass || '';
        const themeDefaut = config?.defaultTheme || 'light';
        
        // cherche si la classe dark mode
        const aClasseSombre = classDark ? 
            (document.body.classList.contains(classDark) || document.documentElement.classList.contains(classDark)) 
            : false;

        // cherche si la classe light mode
        const aClasseClaire = classLight ? 
            (document.body.classList.contains(classLight) || document.documentElement.classList.contains(classLight)) 
            : false;

        if (aClasseSombre)
            this.isDarkModeActive.set(true);

        else if (aClasseClaire)
            this.isDarkModeActive.set(false);

        else
            this.isDarkModeActive.set(themeDefaut == 'dark');
    }

    private AnnulerCreationClavier(): void 
    {
        this.dragCreationEnCours.set(false);
        this.dateDebutCreation.set(null);
        this.dateFinCreation.set(null);
    }

    private DeclencherNavigation(direction: 'left' | 'right'): void 
    {
        if (direction == 'left') 
            this.Precedent();

        else 
            this.Suivant();
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
                this.DeclencherNavigation(surLaBulle);
                this.navigationInterval = setInterval(() => 
                {
                    // Sécurité Anti-Boucle
                    if (!this.dragCreationEnCours() && !this.previewResize()) 
                    {
                        this.NettoyerNavigationBulle();
                        return;
                    }

                    this.DeclencherNavigation(surLaBulle!);
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
            const formatterDate = new Intl.DateTimeFormat(this.langue(), { day: 'numeric', month: 'short' });
            return `${formatterDate.format(start)} ${formatHeure(start)} - ${formatterDate.format(end)} ${formatHeure(end)}`;
        }

        return `${formatHeure(start)} - ${formatHeure(end)}`;
    }

    @HostListener('window:resize')
    protected OnResize(): void 
    {
        this.estPetitEcran.set(window.innerWidth <= 1280);
    }
}