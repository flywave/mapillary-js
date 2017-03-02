import {BehaviorSubject} from "rxjs/BehaviorSubject";
import {Observable} from "rxjs/Observable";
import {Subject} from "rxjs/Subject";

import "rxjs/add/operator/filter";
import "rxjs/add/operator/map";
import "rxjs/add/operator/merge";
import "rxjs/add/operator/scan";
import "rxjs/add/operator/switchMap";

export class TouchMove implements Touch {
    public movementX: number;
    public movementY: number;

    public identifier: number;

    public clientX: number;
    public clientY: number;
    public pageX: number;
    public pageY: number;
    public screenX: number;
    public screenY: number;

    public target: EventTarget;

    constructor(touch?: Touch) {
        this.movementX = 0;
        this.movementY = 0;

        if (touch == null) {
            return;
        }

        this.identifier = touch.identifier;

        this.clientX = touch.clientX;
        this.clientY = touch.clientY;
        this.pageX = touch.pageX;
        this.pageY = touch.pageY;
        this.screenX = touch.screenX;
        this.screenY = touch.screenY;

        this.target = touch.target;
    }
}

export interface IPinch {
    /**
     * X client coordinate for center of pinch.
     */
    clientX: number;

    /**
     * Y client coordinate for center of pinch.
     */
    clientY: number;

    /**
     * X page coordinate for center of pinch.
     */
    pageX: number;

    /**
     * Y page coordinate for center of pinch.
     */
    pageY: number;

    /**
     * X screen coordinate for center of pinch.
     */
    screenX: number;

    /**
     * Y screen coordinate for center of pinch.
     */
    screenY: number;

    /**
     * Distance change in X direction between touches
     * compared to previous event.
     */
    changeX: number;

    /**
     * Distance change in Y direction between touches
     * compared to previous event.
     */
    changeY: number;

    /**
     * Pixel distance between touches.
     */
    distance: number;

    /**
     * Change in pixel distance between touches compared
     * to previous event.
     */
    distanceChange: number;

    /**
     * Distance in X direction between touches.
     */
    distanceX: number;

    /**
     * Distance in Y direction between touches.
     */
    distanceY: number;

    /**
     * Original touch event.
     */
    originalEvent: TouchEvent;

    /**
     * First touch.
     */
    touch1: Touch;

    /**
     * Second touch.
     */
    touch2: Touch;
}

interface IPinchOperation {
    (pinch: IPinch): IPinch;
}

interface ITouchMoveOperation {
    (touchMove: TouchMove): TouchMove;
}

interface IPreventTouchMoveOperation {
    (prevent: boolean): boolean;
}

export class TouchService {
    private _element: HTMLElement;

    private _activeSubject$: BehaviorSubject<boolean>;
    private _active$: Observable<boolean>;

    private _touchStart$: Observable<TouchEvent>;
    private _touchMove$: Observable<TouchEvent>;
    private _touchEnd$: Observable<TouchEvent>;
    private _touchCancel$: Observable<TouchEvent>;

    private _singleTouchMoveOperation$: Subject<ITouchMoveOperation>;
    private _singleTouchMove$: Observable<TouchMove>;
    private _singleTouchMoveStart$: Observable<TouchMove>;
    private _singleTouchMoveEnd$: Observable<TouchEvent>;
    private _singleTouch$: Observable<TouchMove>;

    private _pinchOperation$: Subject<IPinchOperation>;
    private _pinch$: Observable<IPinch>;
    private _pinchStart$: Observable<TouchEvent>;
    private _pinchEnd$: Observable<TouchEvent>;
    private _pinchChange$: Observable<IPinch>;

    constructor(element: HTMLElement) {
        this._element = element;

        this._activeSubject$ = new BehaviorSubject<boolean>(false);

        this._active$ = this._activeSubject$
            .distinctUntilChanged()
            .publishReplay(1)
            .refCount();

        this._touchStart$ = Observable.fromEvent<TouchEvent>(element, "touchstart");
        this._touchMove$ = Observable.fromEvent<TouchEvent>(element, "touchmove");
        this._touchEnd$ = Observable.fromEvent<TouchEvent>(element, "touchend");
        this._touchCancel$ = Observable.fromEvent<TouchEvent>(element, "touchcancel");

        this._singleTouchMoveOperation$ = new Subject<ITouchMoveOperation>();

        this._singleTouchMove$ = this._singleTouchMoveOperation$
            .scan(
                (touch: TouchMove, operation: ITouchMoveOperation): TouchMove => {
                    return operation(touch);
                },
                new TouchMove());

        this._touchMove$
            .filter(
                (te: TouchEvent): boolean => {
                    return te.touches.length === 1 && te.targetTouches.length === 1;
                })
            .map(
                (te: TouchEvent): ITouchMoveOperation => {
                    return (previous: TouchMove): TouchMove => {
                        let touch: Touch = te.touches[0];

                        let current: TouchMove = new TouchMove(touch);

                        current.movementX = touch.pageX - previous.pageX;
                        current.movementY = touch.pageY - previous.pageY;

                        return current;
                    };
                })
            .subscribe(this._singleTouchMoveOperation$);

        let singleTouchStart$: Observable<TouchEvent> = Observable
            .merge<TouchEvent>(
                this._touchStart$,
                this._touchEnd$,
                this._touchCancel$)
            .filter(
                (te: TouchEvent): boolean => {
                    return te.touches.length === 1 && te.targetTouches.length === 1;
                });

        let multipleTouchStart$: Observable<TouchEvent> = Observable
            .merge<TouchEvent>(
                this._touchStart$,
                this._touchEnd$,
                this._touchCancel$)
            .filter(
                (te: TouchEvent): boolean => {
                    return te.touches.length >= 1;
                });

        let touchStop$: Observable<TouchEvent> = Observable
            .merge<TouchEvent>(
                this._touchEnd$,
                this._touchCancel$)
            .filter(
                (te: TouchEvent): boolean => {
                    return te.touches.length === 0;
                });

        this._singleTouchMoveStart$ = singleTouchStart$
            .mergeMap(
                (e: TouchEvent): Observable<TouchMove> => {
                    return this._singleTouchMove$
                        .takeUntil(
                            Observable.merge(
                                touchStop$,
                                multipleTouchStart$))
                        .take(1);
                });

        this._singleTouchMoveEnd$ = singleTouchStart$
            .mergeMap(
                (e: TouchEvent): Observable<TouchEvent> => {
                    return Observable
                        .merge(
                            touchStop$,
                            multipleTouchStart$)
                        .first();
                });

        this._singleTouch$ = singleTouchStart$
            .switchMap(
                (te: TouchEvent): Observable<TouchMove> => {
                    return this._singleTouchMove$
                        .skip(1)
                        .takeUntil(
                            Observable
                                .merge(
                                    multipleTouchStart$,
                                    touchStop$));
                });

        let touchesChanged$: Observable<TouchEvent> = Observable
            .merge<TouchEvent>(
                this._touchStart$,
                this._touchEnd$,
                this._touchCancel$);

        this._pinchStart$ = touchesChanged$
            .filter(
                (te: TouchEvent): boolean => {
                    return te.touches.length === 2 && te.targetTouches.length === 2;
                });

        this._pinchEnd$ = touchesChanged$
            .filter(
                (te: TouchEvent): boolean => {
                    return te.touches.length !== 2 || te.targetTouches.length !== 2;
                });

        this._pinchOperation$ = new Subject<IPinchOperation>();

        this._pinch$ = this._pinchOperation$
            .scan(
                (pinch: IPinch, operation: IPinchOperation): IPinch => {
                    return operation(pinch);
                },
                {
                    changeX: 0,
                    changeY: 0,
                    clientX: 0,
                    clientY: 0,
                    distance: 0,
                    distanceChange: 0,
                    distanceX: 0,
                    distanceY: 0,
                    originalEvent: null,
                    pageX: 0,
                    pageY: 0,
                    screenX: 0,
                    screenY: 0,
                    touch1: null,
                    touch2: null,
                });

        this._touchMove$
            .filter(
                (te: TouchEvent): boolean => {
                    return te.touches.length === 2 && te.targetTouches.length === 2;
                })
            .map(
                (te: TouchEvent): IPinchOperation => {
                    return (previous: IPinch): IPinch => {
                        let touch1: Touch = te.touches[0];
                        let touch2: Touch = te.touches[1];

                        let minX: number = Math.min(touch1.clientX, touch2.clientX);
                        let maxX: number = Math.max(touch1.clientX, touch2.clientX);

                        let minY: number = Math.min(touch1.clientY, touch2.clientY);
                        let maxY: number = Math.max(touch1.clientY, touch2.clientY);

                        let centerClientX: number = minX + (maxX - minX) / 2;
                        let centerClientY: number = minY + (maxY - minY) / 2;

                        let centerPageX: number = centerClientX + touch1.pageX - touch1.clientX;
                        let centerPageY: number = centerClientY + touch1.pageY - touch1.clientY;

                        let centerScreenX: number = centerClientX + touch1.screenX - touch1.clientX;
                        let centerScreenY: number = centerClientY + touch1.screenY - touch1.clientY;

                        let distanceX: number = Math.abs(touch1.clientX - touch2.clientX);
                        let distanceY: number = Math.abs(touch1.clientY - touch2.clientY);

                        let distance: number = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

                        let distanceChange: number = distance - previous.distance;

                        let changeX: number = distanceX - previous.distanceX;
                        let changeY: number = distanceY - previous.distanceY;

                        let current: IPinch = {
                            changeX: changeX,
                            changeY: changeY,
                            clientX: centerClientX,
                            clientY: centerClientY,
                            distance: distance,
                            distanceChange: distanceChange,
                            distanceX: distanceX,
                            distanceY: distanceY,
                            originalEvent: te,
                            pageX: centerPageX,
                            pageY: centerPageY,
                            screenX: centerScreenX,
                            screenY: centerScreenY,
                            touch1: touch1,
                            touch2: touch2,
                        };

                        return current;
                    };
                })
            .subscribe(this._pinchOperation$);

        this._pinchChange$ = this._pinchStart$
            .switchMap(
                (te: TouchEvent): Observable<IPinch> => {
                    return this._pinch$
                        .skip(1)
                        .takeUntil(this._pinchEnd$);
                });
    }

    public get active$(): Observable<boolean> {
        return this._active$;
    }

    public get activate$(): Subject<boolean> {
        return this._activeSubject$;
    }

    public get touchStart$(): Observable<TouchEvent> {
        return this._touchStart$;
    }

    public get touchMove$(): Observable<TouchEvent> {
        return this._touchMove$;
    }

    public get touchEnd$(): Observable<TouchEvent> {
        return this._touchEnd$;
    }

    public get touchCancel$(): Observable<TouchEvent> {
        return this._touchCancel$;
    }

    public get singleTouchMoveStart$(): Observable<TouchMove> {
        return this._singleTouchMoveStart$;
    }

    public get singleTouchMove$(): Observable<TouchMove> {
        return this._singleTouch$;
    }

    public get singleTouchMoveEnd$(): Observable<TouchEvent> {
        return this._singleTouchMoveEnd$;
    }

    public get pinch$(): Observable<IPinch> {
        return this._pinchChange$;
    }

    public get pinchStart$(): Observable<TouchEvent> {
        return this._pinchStart$;
    }

    public get pinchEnd$(): Observable<TouchEvent> {
        return this._pinchEnd$;
    }
}
