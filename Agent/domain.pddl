(define (domain default)

    (:requirements :strips :typing :negative-preconditions :disjunctive-preconditions)

    (:types
        a p c me ;Typings (a - other agents, p - parcels, c - cells, me - our agent)
        )

    (:predicates
        (at ?me - me ?c - c) ;Where our agent is
        (in ?p - p ?c - c) ;The position of the parcel
        (occ ?a - a ?c - c) ;The position of other agents

        (is-delivery ?c - c) ;If the cell is a delivery point
        (is-blocked ?c - c) ;If the cell is not walkable

        (neighbourUp ?c1 - c ?c2 - c) ;If the first cell has the second as a neighbour up
        (neighbourDown ?c1 - c ?c2 - c) ;If the first cell has the second as a neighbour down
        (neighbourLeft ?c1 - c ?c2 - c) ;If the first cell has the second as a neighbour left
        (neighbourRight ?c1 - c ?c2 - c) ;If the first cell has the second as a neighbour right

        (holding ?me - me ?p - p) ;If our agent is holding the parcel
        (delivered ?p - p) ;If the parcel is delivered
    )

    ;Move up if our agent is in c1, c2 is walkable and a neighbourUp of c1 and c2 is not blocked by any agent
    (:action up
        :parameters (?me - me ?c1 - c ?c2 - c)
        :precondition (and
            (neighbourUp ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?me ?c1)
            (forall
                (?a - a)
                (not (occ ?a ?c2)))
        )
        :effect (and
            (at ?me ?c2)
            (not (at ?me ?c1))
        )
    )

    ;Move down if our agent is in c1, c2 is walkable and a neighbourDown of c1 and c2 is not blocked by any agent
    (:action down
        :parameters (?me - me ?c1 - c ?c2 - c)
        :precondition (and
            (neighbourDown ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?me ?c1)
            (forall
                (?a - a)
                (not (occ ?a ?c2)))
        )
        :effect (and
            (at ?me ?c2)
            (not (at ?me ?c1))
        )
    )

    ;Move right if our agent is in c1, c2 is walkable and a neighbourRight of c1 and c2 is not blocked by any agent
    (:action right
        :parameters (?me - me ?c1 - c ?c2 - c)
        :precondition (and
            (neighbourRight ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?me ?c1)
            (forall
                (?a - a)
                (not (occ ?a ?c2)))
        )
        :effect (and
            (at ?me ?c2)
            (not (at ?me ?c1))
        )
    )

    ;Move left if our agent is in c1, c2 is walkable and a neighbourLeft of c1 and c2 is not blocked by any agent
    (:action left
        :parameters (?me - me ?c1 - c ?c2 - c)
        :precondition (and
            (neighbourLeft ?c1 ?c2)
            (not (is-blocked ?c2))
            (at ?me ?c1)
            (forall
                (?a - a)
                (not (occ ?a ?c2)))
        )
        :effect (and
            (at ?me ?c2)
            (not (at ?me ?c1))
        )
    )

    ;Pickup the parcel if our agent and the parcel are in c1 and our agent is not holding that parcel
    (:action pickup
        :parameters (?me - me ?p - p ?c - c)
        :precondition (and
            (at ?me ?c)
            (in ?p ?c)
            (not (holding ?me ?p))
        )
        :effect (and
            (holding ?me ?p)
            (not (in ?p ?c))
        )
    )

    ;Putdown the parcel if our agent is in c1, c1 is a delivery cell and our agent is holding that parcel
    (:action putdown
        :parameters (?me - me ?p - p ?c - c)
        :precondition (and
            (at ?me ?c)
            (holding ?me ?p)
            (is-delivery ?c)
        )
        :effect (and
            (not (holding ?me ?p))
            (delivered ?p)
        )
    )
)