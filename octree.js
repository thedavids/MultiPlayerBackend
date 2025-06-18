export class OctreeNode {
    constructor(center, size, depth = 0, maxDepth = 5, maxObjects = 8) {
        this.center = center; // { x, y, z }
        this.size = size;     // scalar length of cube's edge
        this.depth = depth;
        this.maxDepth = maxDepth;
        this.maxObjects = maxObjects;

        this.objects = [];
        this.children = null;
    }

    getAABB() {
        const half = this.size / 2;
        return {
            min: {
                x: this.center.x - half,
                y: this.center.y - half,
                z: this.center.z - half,
            },
            max: {
                x: this.center.x + half,
                y: this.center.y + half,
                z: this.center.z + half,
            },
        };
    }

    intersects(aabb) {
        const nodeAABB = this.getAABB();
        return !(
            nodeAABB.max.x < aabb.min.x || nodeAABB.min.x > aabb.max.x ||
            nodeAABB.max.y < aabb.min.y || nodeAABB.min.y > aabb.max.y ||
            nodeAABB.max.z < aabb.min.z || nodeAABB.min.z > aabb.max.z
        );
    }

    insert(object) {
        const objAABB = this.computeObjectAABB(object);
        if (!this.intersects(objAABB)) return false;

        // Subdivide if needed
        if (!this.children && this.objects.length >= this.maxObjects && this.depth < this.maxDepth) {
            this.subdivide();
        }

        // Try inserting into children only if fully contained
        if (this.children) {
            for (const child of this.children) {
                if (this.fullyContains(child.getAABB(), objAABB)) {
                    return child.insert(object);
                }
            }
        }

        // Otherwise, keep object in this node
        this.objects.push(object);
        return true;
    }

    fullyContains(container, target) {
        return (
            container.min.x <= target.min.x && container.max.x >= target.max.x &&
            container.min.y <= target.min.y && container.max.y >= target.max.y &&
            container.min.z <= target.min.z && container.max.z >= target.max.z
        );
    }

    subdivide() {
        const half = this.size / 2;
        const quarter = half / 2;
        const offsets = [
            [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
        ];

        this.children = offsets.map(offset => {
            return new OctreeNode(
                {
                    x: this.center.x + offset[0] * quarter,
                    y: this.center.y + offset[1] * quarter,
                    z: this.center.z + offset[2] * quarter,
                },
                half,
                this.depth + 1,
                this.maxDepth,
                this.maxObjects
            );
        });

        for (let i = 0; i < this.objects.length; i++) {
            const obj = this.objects[i];
            for (const child of this.children) {
                if (child.insert(obj)) {
                    this.objects[i] = null; // Mark for cleanup
                    break;
                }
            }
        }

        // Remove all null-marked entries
        this.objects = this.objects.filter(obj => obj !== null);
    }

    computeObjectAABB(obj) {
        const half = {
            x: obj.size[0] / 2,
            y: obj.size[1] / 2,
            z: obj.size[2] / 2,
        };
        return {
            min: {
                x: obj.position.x - half.x,
                y: obj.position.y - half.y,
                z: obj.position.z - half.z,
            },
            max: {
                x: obj.position.x + half.x,
                y: obj.position.y + half.y,
                z: obj.position.z + half.z,
            },
        };
    }

    intersectsAABB(a, b) {
        return !(
            a.max.x <= b.min.x || a.min.x >= b.max.x ||
            a.max.y <= b.min.y || a.min.y >= b.max.y ||
            a.max.z <= b.min.z || a.min.z >= b.max.z
        );
    }

    queryRange(range, result = [], filterFn = null, padding = 1.5, _alreadyPadded = false) {
        const queryBox = _alreadyPadded
            ? range
            : {
                min: {
                    x: range.min.x - padding,
                    y: range.min.y - padding,
                    z: range.min.z - padding
                },
                max: {
                    x: range.max.x + padding,
                    y: range.max.y + padding,
                    z: range.max.z + padding
                }
            };

        if (!this.intersects(queryBox)) return result;
        if (this.objects.length === 0 && !this.children) return result;

        for (const obj of this.objects) {
            const objAABB = this.computeObjectAABB(obj);
            if (this.intersectsAABB(objAABB, queryBox)) {
                if (!filterFn || filterFn(obj)) {
                    result.push(obj);
                }
            }
        }

        if (this.children) {
            for (const child of this.children) {
                child.queryRange(queryBox, result, filterFn, padding, true);
            }
        }

        return result;
    }


    queryCapsule(capsule, result = [], filterFn = null) {
        const r = capsule.radius;
        const padding = 0.05; // small epsilon to catch borderline overlaps

        const capsuleAABB = {
            min: {
                x: Math.min(capsule.start.x, capsule.end.x) - r - padding,
                y: Math.min(capsule.start.y, capsule.end.y) - r - padding,
                z: Math.min(capsule.start.z, capsule.end.z) - r - padding,
            },
            max: {
                x: Math.max(capsule.start.x, capsule.end.x) + r + padding,
                y: Math.max(capsule.start.y, capsule.end.y) + r + padding,
                z: Math.max(capsule.start.z, capsule.end.z) + r + padding,
            }
        };

        return this.queryRange(capsuleAABB, result, filterFn);
    }

    queryRay(origin, direction, maxDist, result = [], filterFn = null) {
        const end = {
            x: origin.x + direction.x * maxDist,
            y: origin.y + direction.y * maxDist,
            z: origin.z + direction.z * maxDist
        };

        const range = {
            min: {
                x: Math.min(origin.x, end.x),
                y: Math.min(origin.y, end.y),
                z: Math.min(origin.z, end.z)
            },
            max: {
                x: Math.max(origin.x, end.x),
                y: Math.max(origin.y, end.y),
                z: Math.max(origin.z, end.z)
            }
        };

        return this.queryRange(range, result, filterFn);
    }

    querySphere(center, radius, result = [], filterFn = null) {
        const range = {
            min: {
                x: center.x - radius,
                y: center.y - radius,
                z: center.z - radius
            },
            max: {
                x: center.x + radius,
                y: center.y + radius,
                z: center.z + radius
            }
        };
        return this.queryRange(range, result, filterFn);
    }
}

export function computeMapBounds(objects) {
    let min = { x: Infinity, y: Infinity, z: Infinity };
    let max = { x: -Infinity, y: -Infinity, z: -Infinity };

    for (const obj of objects) {
        const size = obj.size;
        const pos = obj.position;

        const half = {
            x: size[0] / 2,
            y: size[1] / 2,
            z: size[2] / 2
        };

        const objMin = {
            x: pos.x - half.x,
            y: pos.y - half.y,
            z: pos.z - half.z
        };

        const objMax = {
            x: pos.x + half.x,
            y: pos.y + half.y,
            z: pos.z + half.z
        };

        min.x = Math.min(min.x, objMin.x);
        min.y = Math.min(min.y, objMin.y);
        min.z = Math.min(min.z, objMin.z);

        max.x = Math.max(max.x, objMax.x);
        max.y = Math.max(max.y, objMax.y);
        max.z = Math.max(max.z, objMax.z);
    }

    const center = {
        x: (min.x + max.x) / 2,
        y: (min.y + max.y) / 2,
        z: (min.z + max.z) / 2
    };

    const size = Math.max(
        max.x - min.x,
        max.y - min.y,
        max.z - min.z
    ) + 20;

    return { center, size };
}
